"""PostgreSQL persistence with the small collection API the existing routes use.

The JSONB document keeps this migration API-compatible. Normalize a collection into
dedicated relational tables only when its query volume or constraints need it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, select, delete
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class StoredDocument(Base):
    __tablename__ = "documents"
    collection: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


def _matches(doc: dict[str, Any], query: dict[str, Any]) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, option) for option in expected):
                return False
            continue
        value = doc.get(key)
        if isinstance(expected, dict):
            if "$in" in expected and value not in expected["$in"]:
                return False
            if "$ne" in expected and value == expected["$ne"]:
                return False
            if "$regex" in expected and not re.search(expected["$regex"], str(value or ""), re.I if expected.get("$options") == "i" else 0):
                return False
        elif value != expected:
            return False
    return True


def _project(doc: dict[str, Any], projection: dict[str, int] | None) -> dict[str, Any]:
    result = dict(doc)
    if projection and any(value == 0 for value in projection.values()):
        for key, value in projection.items():
            if value == 0:
                result.pop(key, None)
    return result


class Cursor:
    def __init__(self, collection: "Collection", query: dict[str, Any], projection: dict[str, int] | None):
        self.collection, self.query, self.projection, self.order = collection, query, projection, None

    def sort(self, field: str, direction: int) -> "Cursor":
        self.order = (field, direction)
        return self

    async def to_list(self, length: int) -> list[dict[str, Any]]:
        docs = await self.collection._all(self.query, self.projection)
        if self.order:
            field, direction = self.order
            docs.sort(key=lambda row: (row.get(field) is None, row.get(field)), reverse=direction < 0)
        return docs[:length]


class Collection:
    def __init__(self, database: "Database", name: str):
        self.database, self.name = database, name

    async def _all(self, query: dict[str, Any], projection: dict[str, int] | None = None) -> list[dict[str, Any]]:
        async with self.database.session() as session:
            rows = (await session.execute(select(StoredDocument.data).where(StoredDocument.collection == self.name))).scalars()
            return [_project(row, projection) for row in rows if _matches(row, query)]

    async def find_one(self, query: dict[str, Any], projection: dict[str, int] | None = None):
        docs = await self._all(query, projection)
        return docs[0] if docs else None

    def find(self, query: dict[str, Any], projection: dict[str, int] | None = None) -> Cursor:
        return Cursor(self, query, projection)

    async def insert_one(self, document: dict[str, Any]):
        async with self.database.session() as session:
            session.add(StoredDocument(collection=self.name, document_id=document["id"], data=dict(document)))
            await session.commit()

    async def update_one(self, query: dict[str, Any], update: dict[str, Any]):
        document = await self.find_one(query)
        if not document:
            return
        document.update(update.get("$set", {}))
        for key, amount in update.get("$inc", {}).items():
            document[key] = document.get(key, 0) + amount
        await self._save(document)

    async def replace_one(self, query: dict[str, Any], document: dict[str, Any], upsert: bool = False):
        existing = await self.find_one(query)
        if existing or upsert:
            if existing and existing["id"] != document["id"]:
                await self._delete(existing["id"])
            await self._save(document)

    async def _save(self, document: dict[str, Any]):
        async with self.database.session() as session:
            await session.merge(StoredDocument(collection=self.name, document_id=document["id"], data=dict(document)))
            await session.commit()

    async def _delete(self, document_id: str):
        async with self.database.session() as session:
            await session.execute(delete(StoredDocument).where(StoredDocument.collection == self.name, StoredDocument.document_id == document_id))
            await session.commit()

    async def count_documents(self, query: dict[str, Any]) -> int:
        return len(await self._all(query))

    async def distinct(self, field: str, query: dict[str, Any]) -> list[Any]:
        return list({doc[field] for doc in await self._all(query) if field in doc})

    async def create_index(self, *args, **kwargs):
        return None


class Database:
    def __init__(self, url: str):
        self.engine = create_async_engine(url, pool_pre_ping=True)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)

    def __getattr__(self, name: str) -> Collection:
        return Collection(self, name)

    async def connect(self):
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def close(self):
        await self.engine.dispose()
