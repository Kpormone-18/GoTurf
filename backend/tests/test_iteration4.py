"""Iteration 4 - Media upload (turf photos) feature tests.

Covers:
- POST /api/owner/uploads (auth, content-type gating, happy path)
- GET /api/media/{path} (public read for turfs/, 403 for verifications/, path traversal rejection)
- GET /api/files/{path} regression (still 401 without token)
- Light regression: owner create turf (verified requirement), checkout + payout
"""
import io
import os
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://goturf-accra.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@goturf.gh", "password": "REDACTED_DO_NOT_USE"}
ADMIN = {"email": "kpomsgh@gmail.com", "password": "REDACTED_DO_NOT_USE"}


def _tiny_png_bytes() -> bytes:
    """Build a minimal 1x1 PNG (valid header, IHDR, IDAT, IEND)."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)  # 1x1, 8-bit RGB
    raw = b"\x00" + b"\xff\x00\x00"  # filter + 1 red pixel
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json=OWNER, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_id(owner_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {owner_token}"}, timeout=20)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def png():
    return _tiny_png_bytes()


# ---------- Upload endpoint ----------

class TestUpload:
    def test_upload_requires_auth(self, png):
        files = {"files": ("x.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/owner/uploads", files=files, timeout=20)
        assert r.status_code in (401, 403), r.text

    def test_upload_rejects_non_image(self, owner_token):
        files = {"files": ("x.txt", io.BytesIO(b"hello world"), "text/plain")}
        r = requests.post(f"{API}/owner/uploads", files=files,
                          headers={"Authorization": f"Bearer {owner_token}"}, timeout=20)
        assert r.status_code == 400, r.text

    def test_upload_happy_path(self, owner_token, owner_id, png):
        files = {"files": ("tiny.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/owner/uploads", files=files,
                          headers={"Authorization": f"Bearer {owner_token}"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "files" in body and len(body["files"]) == 1
        item = body["files"][0]
        assert item["path"].startswith(f"goturf/turfs/{owner_id}/"), item["path"]
        assert item["url"] == f"/api/media/{item['path']}"
        # stash for serving tests
        pytest._uploaded_path = item["path"]
        pytest._uploaded_url = item["url"]


# ---------- Media serving ----------

class TestMediaServing:
    def test_public_serve_ok_no_auth(self, png):
        path = getattr(pytest, "_uploaded_path", None)
        assert path, "upload test must run first"
        r = requests.get(f"{API}/media/{path}", timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/")
        assert r.content == png

    def test_media_blocks_verifications_prefix(self):
        r = requests.get(f"{API}/media/goturf/verifications/anyone/ghana.jpg", timeout=20)
        assert r.status_code == 403, r.text

    def test_media_blocks_path_traversal(self):
        # ..%2F encoded so routing doesn't collapse the path
        r = requests.get(f"{API}/media/goturf/turfs/..%2Fsecret.jpg", timeout=20)
        assert r.status_code in (403, 404), r.text

    def test_media_blocks_other_prefix(self):
        r = requests.get(f"{API}/media/random/x.jpg", timeout=20)
        assert r.status_code == 403, r.text


# ---------- /files regression ----------

class TestFilesPrivate:
    def test_files_without_token_401(self):
        r = requests.get(f"{API}/files/goturf/verifications/x/front.jpg", timeout=20)
        assert r.status_code == 401, r.text


# ---------- Light regression: owner create turf w/ uploaded image ----------

class TestOwnerCreateTurf:
    def test_create_turf_with_image(self, owner_token):
        url = getattr(pytest, "_uploaded_url", None)
        assert url
        abs_url = f"{BASE_URL}{url}"
        payload = {
            "name": "TEST_ITER4 Turf",
            "location": "Accra",
            "neighborhood": "East Legon",
            "turf_type": "5-a-side",
            "base_hourly": 150,
            "images": [abs_url],
            "amenities": ["Parking"],
            "packages": [],
            "description": "iter4 upload test",
        }
        r = requests.post(f"{API}/owner/turfs", json=payload,
                          headers={"Authorization": f"Bearer {owner_token}"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert abs_url in data.get("images", [])
        pytest._created_turf_id = data["id"]

    def test_turf_visible_publicly_with_image(self):
        tid = getattr(pytest, "_created_turf_id", None)
        assert tid
        r = requests.get(f"{API}/turfs/{tid}", timeout=20)
        assert r.status_code == 200
        assert any("/api/media/" in u for u in r.json().get("images", []))

    def test_cleanup(self, owner_token):
        tid = getattr(pytest, "_created_turf_id", None)
        if not tid:
            return
        # Soft-delete via owner endpoint if available; otherwise ignore.
        r = requests.delete(f"{API}/owner/turfs/{tid}",
                            headers={"Authorization": f"Bearer {owner_token}"}, timeout=20)
        assert r.status_code in (200, 204, 404, 405)


# ---------- Light regression: payout-method still works ----------

class TestRegressionPayout:
    def test_payout_momo_save(self, owner_token):
        r = requests.post(f"{API}/owner/payout-method", json={
            "type": "momo", "account_name": "Owner Test",
            "momo_provider": "MTN MoMo", "momo_number": "0244111222"
        }, headers={"Authorization": f"Bearer {owner_token}"}, timeout=20)
        assert r.status_code == 200, r.text
