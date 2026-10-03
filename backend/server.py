from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
import time
import uuid
import random
import string
import re
import ipaddress
import hmac
import hashlib
import bcrypt
import boto3
import jwt
import httpx
from datetime import datetime, timezone, timedelta, date as date_cls
from typing import List, Optional, Literal
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

from fastapi import (FastAPI, APIRouter, HTTPException, Depends, Request, Query,
                     UploadFile, File, Form, Header)
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import text
from storage.postgres import Database

# ------------------------------------------------------------------ DB / APP
db = Database(os.environ["DATABASE_URL"])

app = FastAPI(title="GoTurf API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("goturf")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
PLATFORM_FEE_PCT = 10          # platform commission on payout
CANCEL_PENALTY = 30            # GHS fixed penalty after full-refund window
STRIKE_THRESHOLD = 5           # strikes before monetary penalty
STRIKE_PENALTY = 200           # GHS penalty after threshold
SUSPENSION_DAYS = 14
DISPUTE_WINDOW_MIN = 30        # payout hold after booking end
OWNER_CANCEL_COUPON_PCT = 20   # future-booking discount after owner cancel
AUTH_RATE_LIMIT = 10
AUTH_RATE_WINDOW_SECONDS = 15 * 60
_auth_attempts: dict[str, list[float]] = {}


def enforce_auth_rate_limit(request: Request) -> None:
    """Small local guard; production must use a shared proxy or Redis limit."""
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    attempts = [value for value in _auth_attempts.get(client, []) if now - value < AUTH_RATE_WINDOW_SECONDS]
    if len(attempts) >= AUTH_RATE_LIMIT:
        raise HTTPException(429, "Too many attempts. Try again later.", headers={"Retry-After": str(AUTH_RATE_WINDOW_SECONDS)})
    attempts.append(now)
    _auth_attempts[client] = attempts

# ------------------------------------------------------------------ EMAIL
RESEND_API_KEY = (os.environ.get("RESEND_API_KEY") or "").strip()
EMAIL_FROM = (os.environ.get("EMAIL_FROM") or "").strip()

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    if not RESEND_API_KEY or not EMAIL_FROM:
        logger.warning("Email disabled: set RESEND_API_KEY and EMAIL_FROM to enable delivery")
        return None
    _assert_safe_email(subject, html)
    payload = {"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post("https://api.resend.com/emails",
                                headers={"Authorization": f"Bearer {RESEND_API_KEY}"}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return None


def _email_shell(title: str, lines: List[str]) -> str:
    inner = "".join(f'<p style="margin:0 0 12px;color:#334155">{l}</p>' for l in lines)
    return (f'<table role="presentation" width="100%" style="background:#f8f9fa;padding:24px">'
            f'<tr><td align="center"><table role="presentation" width="520" '
            f'style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;'
            f'font-family:Arial,sans-serif">'
            f'<tr><td><div style="font-size:22px;font-weight:800;color:#059669;margin-bottom:4px">GoTurf</div>'
            f'<h1 style="font-size:20px;color:#0f172a;margin:0 0 16px">{escape(title)}</h1>'
            f'{inner}'
            f'<p style="font-size:12px;color:#94a3b8;margin-top:24px">Sent by GoTurf, Accra. '
            f'We never ask for your password or card details by email.</p>'
            f'</td></tr></table></td></tr></table>')


# ------------------------------------------------------------------ INTEGRATIONS CONFIG
PAYSTACK_SECRET = (os.environ.get("PAYSTACK_SECRET_KEY") or "").strip()
PAYSTACK_PUBLIC = (os.environ.get("PAYSTACK_PUBLIC_KEY") or "").strip()
PAYSTACK_ENABLED = PAYSTACK_SECRET.startswith("sk_")

TWILIO_SID = (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()
TWILIO_TOKEN = (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
TWILIO_FROM = (os.environ.get("TWILIO_FROM") or "").strip()
SMS_ENABLED = bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM)

WEBHOOK_CRON_SECRET = (os.environ.get("WEBHOOK_CRON_SECRET") or "").strip()
CORS_ORIGINS = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]

# ---- Object storage (any S3-compatible provider: AWS S3, Cloudflare R2, etc.)
S3_BUCKET = (os.environ.get("S3_BUCKET") or "").strip()
S3_REGION = (os.environ.get("AWS_REGION") or "us-east-1").strip()
S3_ENDPOINT_URL = (os.environ.get("S3_ENDPOINT_URL") or "").strip() or None
APP_NAME = "goturf"
MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
              "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf"}
LOCAL_UPLOAD_DIR = ROOT_DIR / "uploads"
MAX_TURF_IMAGE_BYTES = 5 * 1024 * 1024
TURF_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _storage_client():
    if not S3_BUCKET:
        return None
    return boto3.client("s3", region_name=S3_REGION, endpoint_url=S3_ENDPOINT_URL)


def put_object(path: str, data: bytes, content_type: str) -> dict:
    client = _storage_client()
    if client:
        return client.put_object(Bucket=S3_BUCKET, Key=path, Body=data, ContentType=content_type)
    target = (LOCAL_UPLOAD_DIR / path).resolve()
    if LOCAL_UPLOAD_DIR.resolve() not in target.parents:
        raise ValueError("Invalid storage path")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {}


def get_object(path: str):
    client = _storage_client()
    if client:
        result = client.get_object(Bucket=S3_BUCKET, Key=path)
        return result["Body"].read(), result.get("ContentType", "application/octet-stream")
    target = (LOCAL_UPLOAD_DIR / path).resolve()
    if LOCAL_UPLOAD_DIR.resolve() not in target.parents or not target.is_file():
        raise FileNotFoundError(path)
    ext = target.suffix.removeprefix(".").lower()
    return target.read_bytes(), MIME_TYPES.get(ext, "application/octet-stream")


def validate_turf_image(filename: str, content_type: str, data: bytes) -> str:
    if content_type not in TURF_IMAGE_TYPES:
        raise ValueError("Upload a JPEG, PNG or WebP image")
    if not data or len(data) > MAX_TURF_IMAGE_BYTES:
        raise ValueError("Images must be no larger than 5 MB")
    is_valid = ((content_type == "image/jpeg" and data.startswith(b"\xff\xd8\xff")) or
                (content_type == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n")) or
                (content_type == "image/webp" and data.startswith(b"RIFF") and data[8:12] == b"WEBP"))
    if not is_valid:
        raise ValueError("The uploaded file is not a valid image")
    return TURF_IMAGE_TYPES[content_type]


# ---- SMS (Twilio-ready; logs when not configured)
async def send_sms(to: Optional[str], body: str):
    if not to:
        return
    if not SMS_ENABLED:
        logger.info("[SMS mock] to=%s: %s", to, body)
        return
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            await c.post(f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json",
                         auth=(TWILIO_SID, TWILIO_TOKEN),
                         data={"From": TWILIO_FROM, "To": to, "Body": body})
    except Exception as e:
        logger.error("SMS send failed: %s", e)


async def notify(user_id: Optional[str], kind: str, title: str, body: str, booking_id: Optional[str] = None):
    if not user_id:
        return
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": user_id, "kind": kind,
        "title": title, "body": body, "booking_id": booking_id,
        "read_at": None, "created_at": iso(now_utc()),
    })


# ---- Shared booking confirmation (used by mock pay, Paystack verify, webhook)
async def confirm_booking(booking_id: str, payment_ref: str):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        return None
    if b["status"] == "confirmed":
        return b
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "status": "confirmed", "payment_status": "paid", "amount_paid": b["total"],
        "payment_ref": payment_ref, "paid_at": iso(now_utc())}})
    if b.get("coupon"):
        await db.coupons.update_one({"code": b["coupon"]}, {"$inc": {"uses": 1}})
    await audit("payment", booking_id, f"Payment confirmed for {b['reference']} ({payment_ref})")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    cust = b["customer"]
    if cust.get("email"):
        html = _email_shell("Your booking is confirmed", [
            f"Hi {escape(cust['name'])}, your pitch is locked in.",
            f"<strong>{escape(b['turf_name'])}</strong>",
            f"Date: {escape(b['date'])} &middot; {b['start_hour']:02d}:00 for {b['duration']}h",
            f"Reference: <strong>{escape(b['reference'])}</strong>",
            f"Amount paid: GHS {b['amount_paid']:.2f}",
            "Funds are held safely in escrow and released to the owner after your session ends.",
        ])
        await send_email(to=cust["email"], subject=f"GoTurf booking {b['reference']} confirmed", html=html)
    await send_sms(cust.get("phone"),
                   f"GoTurf: Booking {b['reference']} confirmed at {b['turf_name']} on {b['date']} "
                   f"{b['start_hour']:02d}:00 for {b['duration']}h. See you on the turf!")
    await notify(b.get("user_id"), "booking_confirmed", "Booking confirmed",
                 f"{b['turf_name']} is confirmed for {b['date']} at {b['start_hour']:02d}:00.", b["id"])
    await notify(b.get("owner_id"), "booking_confirmed", "New confirmed booking",
                 f"{b['customer']['name']} booked {b['turf_name']} for {b['date']}.", b["id"])
    return b


# ------------------------------------------------------------------ AUTH UTILS
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dep


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def parse_dt(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def ref_code() -> str:
    return "GT-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


# ------------------------------------------------------------------ MODELS
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["customer", "owner"] = "customer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CustomerInfo(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class BookingIn(BaseModel):
    turf_id: str
    date: str                    # YYYY-MM-DD
    start_hour: int
    duration: int
    customer: CustomerInfo
    coupon_code: Optional[str] = None
    is_package: bool = False
    notes: Optional[str] = None


class RescheduleIn(BaseModel):
    new_date: str
    new_start_hour: int
    new_duration: int


class BookingMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class OwnerCancelIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)
    understands_penalty: bool
    accepts_terms: bool


class ReviewIn(BaseModel):
    booking_id: str
    rating: int
    comment: Optional[str] = ""


class TurfIn(BaseModel):
    name: str
    location: str
    neighborhood: str
    description: str = ""
    turf_type: str = "5-a-side"
    playing_format: str = "5v5"
    images: List[str] = []
    amenities: List[str] = []
    rules: List[str] = []
    base_hourly: float = 150
    peak_hourly: float = 200
    weekend_hourly: float = 220
    peak_hours: List[int] = [17, 18, 19, 20, 21]
    open_hour: int = 6
    close_hour: int = 23
    is_24_hour: bool = False
    packages: List[dict] = []
    lat: Optional[float] = None
    lng: Optional[float] = None
    map_url: Optional[str] = ""
    event_bookings: bool = False
    event_details: str = ""


class CouponIn(BaseModel):
    code: str
    discount_pct: Optional[float] = None
    discount_amount: Optional[float] = None
    turf_id: Optional[str] = None
    expires_at: Optional[str] = None
    max_uses: int = 100


# ------------------------------------------------------------------ PRICING
DEFAULT_PACKAGES = [
    {"hours": 3, "discount_pct": 10},
    {"hours": 6, "discount_pct": 15},
    {"hours": 12, "discount_pct": 20},
    {"hours": 15, "discount_pct": 22},
    {"hours": 24, "discount_pct": 30},
]


def hour_rate(turf: dict, d: date_cls, h: int) -> float:
    if d.weekday() >= 5:
        return turf.get("weekend_hourly", turf["base_hourly"])
    if h in turf.get("peak_hours", []):
        return turf.get("peak_hourly", turf["base_hourly"])
    return turf["base_hourly"]


def booking_slots(turf: dict, date_str: str, start_hour: int, duration: int):
    """Return chronological booking slots; only 24/7 pitches may pass midnight."""
    if duration < 1:
        raise HTTPException(400, "Duration must be at least one hour")
    is_24_hour = turf.get("is_24_hour", False)
    open_hour, close_hour = (0, 24) if is_24_hour else (turf["open_hour"], turf["close_hour"])
    if start_hour < open_hour or start_hour >= close_hour:
        raise HTTPException(400, "Requested start time is outside operating hours")
    if not is_24_hour and start_hour + duration > close_hour:
        raise HTTPException(400, f"This pitch closes at {close_hour:02d}:00. Choose a shorter package or a 24/7 turf.")
    current = datetime.strptime(date_str, "%Y-%m-%d").date()
    hour, remaining, slots = start_hour, duration, []
    while remaining:
        for slot_hour in range(hour, close_hour):
            slots.append((current, slot_hour))
            remaining -= 1
            if not remaining:
                return slots
        current += timedelta(days=1)
        hour = 0


def stored_booking_slots(turf: dict, booking: dict):
    return booking_slots(turf, booking["date"], booking["start_hour"], booking["duration"])


def compute_quote(turf: dict, date_str: str, start_hour: int, duration: int, is_package: bool):
    slots = booking_slots(turf, date_str, start_hour, duration)
    hourly_total = sum(hour_rate(turf, day, hour) for day, hour in slots)
    discount_pct = 0.0
    pkg = None
    if is_package:
        for p in turf.get("packages", DEFAULT_PACKAGES):
            if p["hours"] == duration:
                pkg = p
                discount_pct = p["discount_pct"]
                break
    discount = round(hourly_total * discount_pct / 100, 2)
    total = round(hourly_total - discount, 2)
    segments = []
    for day, hour in slots:
        if not segments or segments[-1]["date"] != day.isoformat():
            segments.append({"date": day.isoformat(), "start_hour": hour, "end_hour": hour + 1})
        else:
            segments[-1]["end_hour"] = hour + 1
    return {"hourly_total": round(hourly_total, 2), "package_discount_pct": discount_pct,
            "package_discount": discount, "total": total, "is_package": bool(pkg), "segments": segments}


def booking_datetimes(turf: dict, date_str: str, start_hour: int, duration: int):
    start = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(hours=start_hour)
    end_day, end_hour = booking_slots(turf, date_str, start_hour, duration)[-1]
    end = datetime.combine(end_day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=end_hour)
    return start, end


def refund_info(booking: dict, at: Optional[datetime] = None) -> dict:
    at = at or now_utc()
    created = parse_dt(booking["created_at"])
    start = parse_dt(booking["start_datetime"])
    gap = (start - created).total_seconds()
    deadline = created + timedelta(seconds=gap * 0.25)
    amount = booking.get("amount_paid", booking.get("total", 0))
    full = at <= deadline
    refund = amount if full else max(0, amount - CANCEL_PENALTY)
    return {
        "full_refund_deadline": iso(deadline),
        "full_refund_available": full,
        "refund_amount": round(refund, 2),
        "penalty": 0 if full else CANCEL_PENALTY,
        "seconds_remaining": max(0, int((deadline - at).total_seconds())),
    }


def payout_status(booking: dict, at: Optional[datetime] = None) -> dict:
    at = at or now_utc()
    end = parse_dt(booking["end_datetime"])
    release_at = end + timedelta(minutes=DISPUTE_WINDOW_MIN)
    amount = booking.get("amount_paid", 0)
    fee = round(amount * PLATFORM_FEE_PCT / 100, 2)
    net = round(amount - fee, 2)
    if booking.get("status") != "confirmed":
        state = "n/a"
    elif booking.get("has_dispute") or booking.get("admin_hold"):
        state = "held_dispute"
    elif at >= release_at:
        state = "released"
    else:
        state = "held"
    return {"state": state, "release_at": iso(release_at), "fee": fee, "net_payout": net}


def clean_turf(t: dict) -> dict:
    t.pop("_id", None)
    return t


# ------------------------------------------------------------------ AUTH ROUTES
@api.post("/auth/register")
async def register(body: RegisterIn, request: Request):
    enforce_auth_rate_limit(request)
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {"id": uid, "name": body.name, "email": email,
           "password_hash": hash_password(body.password), "role": body.role,
           "strikes": 0, "suspended_until": None, "penalty_balance": 0,
           "verified": body.role != "owner",
           "verification_status": "approved" if body.role != "owner" else "unverified",
           "created_at": iso(now_utc())}
    await db.users.insert_one(doc)
    token = create_token(uid, email, body.role)
    return {"token": token, "user": {k: doc[k] for k in ("id", "name", "email", "role", "verified")}}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    enforce_auth_rate_limit(request)
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user["id"], email, user["role"])
    return {"token": token, "user": {"id": user["id"], "name": user["name"], "email": email,
                                     "role": user["role"], "verified": user.get("verified", True)}}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout():
    return {"status": "ok"}


# ------------------------------------------------------------------ TURF ROUTES
@api.get("/turfs")
async def list_turfs(q: Optional[str] = None, neighborhood: Optional[str] = None,
                     turf_type: Optional[str] = None, amenity: Optional[str] = None,
                     max_price: Optional[float] = None):
    query: dict = {"active": True}
    if neighborhood and neighborhood != "all":
        query["neighborhood"] = neighborhood
    if turf_type and turf_type != "all":
        query["turf_type"] = turf_type
    if amenity and amenity != "all":
        query["amenities"] = amenity
    if max_price:
        query["base_hourly"] = {"$lte": max_price}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}},
                        {"location": {"$regex": q, "$options": "i"}},
                        {"neighborhood": {"$regex": q, "$options": "i"}}]
    turfs = await db.turfs.find(query, {"_id": 0}).to_list(200)
    for t in turfs:
        revs = await db.reviews.find({"turf_id": t["id"]}, {"_id": 0, "rating": 1}).to_list(1000)
        t["rating"] = round(sum(r["rating"] for r in revs) / len(revs), 1) if revs else None
        t["review_count"] = len(revs)
    return turfs


@api.get("/turfs/neighborhoods")
async def neighborhoods():
    vals = await db.turfs.distinct("neighborhood", {"active": True})
    return sorted(vals)


@api.get("/turfs/{turf_id}")
async def get_turf(turf_id: str):
    t = await db.turfs.find_one({"id": turf_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Turf not found")
    revs = await db.reviews.find({"turf_id": turf_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    t["reviews"] = revs
    t["rating"] = round(sum(r["rating"] for r in revs) / len(revs), 1) if revs else None
    t["review_count"] = len(revs)
    return t


@api.get("/turfs/{turf_id}/availability")
async def availability(turf_id: str, date: str):
    turf = await db.turfs.find_one({"id": turf_id}, {"_id": 0})
    if not turf:
        raise HTTPException(404, "Turf not found")
    bookings = await db.bookings.find(
        {"turf_id": turf_id, "status": {"$in": ["confirmed", "pending_payment"]}},
        {"_id": 0, "date": 1, "start_hour": 1, "duration": 1}).to_list(500)
    booked = set()
    for b in bookings:
        for day, hour in stored_booking_slots(turf, b):
            if day.isoformat() == date:
                booked.add(hour)
    open_hour, close_hour = (0, 24) if turf.get("is_24_hour", False) else (turf["open_hour"], turf["close_hour"])
    return {"open_hour": open_hour, "close_hour": close_hour, "is_24_hour": turf.get("is_24_hour", False),
            "booked_hours": sorted(booked), "peak_hours": turf.get("peak_hours", [])}


@api.get("/turfs/{turf_id}/quote")
async def quote(turf_id: str, date: str, start_hour: int, duration: int, is_package: bool = False):
    turf = await db.turfs.find_one({"id": turf_id}, {"_id": 0})
    if not turf:
        raise HTTPException(404, "Turf not found")
    return compute_quote(turf, date, start_hour, duration, is_package)


@api.get("/turfs/{turf_id}/reviews")
async def turf_reviews(turf_id: str):
    return await db.reviews.find({"turf_id": turf_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)


# ------------------------------------------------------------------ BOOKINGS
async def apply_coupon(code: str, turf_id: str, amount: float):
    if not code:
        return amount, None
    c = await db.coupons.find_one({"code": code.upper(), "active": True})
    if not c:
        raise HTTPException(400, "Invalid coupon code")
    if c.get("turf_id") and c["turf_id"] != turf_id:
        raise HTTPException(400, "Coupon not valid for this turf")
    if c.get("expires_at") and parse_dt(c["expires_at"]) < now_utc():
        raise HTTPException(400, "Coupon expired")
    if c.get("uses", 0) >= c.get("max_uses", 100):
        raise HTTPException(400, "Coupon usage limit reached")
    disc = 0
    if c.get("discount_pct"):
        disc = amount * c["discount_pct"] / 100
    elif c.get("discount_amount"):
        disc = c["discount_amount"]
    return round(max(0, amount - disc), 2), c["code"]


@api.post("/bookings")
async def create_booking(body: BookingIn, user: Optional[dict] = Depends(get_optional_user)):
    turf = await db.turfs.find_one({"id": body.turf_id}, {"_id": 0})
    if not turf:
        raise HTTPException(404, "Turf not found")
    owner = await db.users.find_one({"id": turf["owner_id"]})
    if owner and owner.get("suspended_until") and parse_dt(owner["suspended_until"]) > now_utc():
        raise HTTPException(409, "This turf is temporarily unavailable")
    requested_slots = booking_slots(turf, body.date, body.start_hour, body.duration)

    # concurrency / overlap check
    existing = await db.bookings.find(
        {"turf_id": body.turf_id, "date": body.date, "status": {"$in": ["confirmed", "pending_payment"]}},
        {"_id": 0, "date": 1, "start_hour": 1, "duration": 1}).to_list(500)
    # Include bookings that started on prior dates when a package carries into this day.
    existing += await db.bookings.find(
        {"turf_id": body.turf_id, "date": {"$ne": body.date}, "status": {"$in": ["confirmed", "pending_payment"]}},
        {"_id": 0, "date": 1, "start_hour": 1, "duration": 1}).to_list(500)
    requested = set(requested_slots)
    for b in existing:
        if requested & set(stored_booking_slots(turf, b)):
            raise HTTPException(409, "One or more selected slots were just booked. Please pick another time.")

    q = compute_quote(turf, body.date, body.start_hour, body.duration, body.is_package)
    amount, coupon = await apply_coupon(body.coupon_code, body.turf_id, q["total"])
    start, end = booking_datetimes(turf, body.date, body.start_hour, body.duration)
    bid = str(uuid.uuid4())
    doc = {
        "id": bid, "reference": ref_code(), "turf_id": body.turf_id, "turf_name": turf["name"],
        "owner_id": turf["owner_id"], "user_id": user["id"] if user else None,
        "customer": body.customer.model_dump(), "date": body.date, "start_hour": body.start_hour,
        "duration": body.duration, "is_package": q["is_package"], "notes": body.notes,
        "quote": q, "coupon": coupon, "total": amount, "amount_paid": 0,
        "status": "pending_payment", "payment_status": "pending",
        "start_datetime": iso(start), "end_datetime": iso(end),
        "created_at": iso(now_utc()), "has_dispute": False, "admin_hold": False,
        "reschedule_request": None, "cancellation": None,
    }
    await db.bookings.insert_one(doc)
    return clean_turf(dict(doc))


class ContactIn(BaseModel):
    customer: CustomerInfo
    coupon_code: Optional[str] = None


@api.post("/bookings/{booking_id}/contact")
async def update_contact(booking_id: str, body: ContactIn):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["status"] != "pending_payment":
        raise HTTPException(400, "Booking already processed")
    upd = {"customer": body.customer.model_dump()}
    if body.coupon_code:
        amount, coupon = await apply_coupon(body.coupon_code, b["turf_id"], b["quote"]["total"])
        upd["coupon"] = coupon
        upd["total"] = amount
    await db.bookings.update_one({"id": booking_id}, {"$set": upd})
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0})


class CheckoutIn(BaseModel):
    customer: CustomerInfo
    coupon_code: Optional[str] = None
    callback_url: Optional[str] = None


@api.get("/payments/config")
async def payments_config():
    return {"provider": "paystack" if PAYSTACK_ENABLED else "mock",
            "public_key": PAYSTACK_PUBLIC if PAYSTACK_ENABLED else None,
            "sms_enabled": SMS_ENABLED}


@api.get("/healthz")
async def healthz():
    try:
        async with db.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check database failure")
        raise HTTPException(503, "Database unavailable")
    return {"status": "ok"}


@api.post("/bookings/{booking_id}/checkout")
async def checkout(booking_id: str, body: CheckoutIn):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["status"] == "confirmed":
        return {"mode": "done", "booking_id": booking_id}
    if b["status"] != "pending_payment":
        raise HTTPException(400, "Booking cannot be paid in its current state")
    if not b.get("user_id") and not body.customer.phone:
        raise HTTPException(400, "A phone number is required for guest checkout")
    upd = {"customer": body.customer.model_dump()}
    total = b["total"]
    if body.coupon_code:
        total, coupon = await apply_coupon(body.coupon_code, b["turf_id"], b["quote"]["total"])
        upd["coupon"] = coupon
        upd["total"] = total
    await db.bookings.update_one({"id": booking_id}, {"$set": upd})

    if PAYSTACK_ENABLED:
        email = body.customer.email or "guest@goturf.gh"
        ref = b["reference"]
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                resp = await c.post("https://api.paystack.co/transaction/initialize",
                                    headers={"Authorization": f"Bearer {PAYSTACK_SECRET}",
                                             "Content-Type": "application/json"},
                                    json={"email": email, "amount": int(round(total * 100)),
                                          "currency": "GHS", "reference": ref,
                                          "callback_url": body.callback_url,
                                          "channels": ["card", "mobile_money", "bank", "ussd"],
                                          "metadata": {"booking_id": booking_id}})
            result = resp.json()
        except Exception as e:
            logger.error("Paystack init error: %s", e)
            raise HTTPException(502, "Could not start payment")
        if not result.get("status"):
            raise HTTPException(400, result.get("message", "Payment init failed"))
        await db.bookings.update_one({"id": booking_id}, {"$set": {"payment_reference": ref}})
        return {"mode": "paystack", "authorization_url": result["data"]["authorization_url"],
                "reference": result["data"]["reference"]}

    # mock fallback
    await confirm_booking(booking_id, "MOCK-" + uuid.uuid4().hex[:12])
    return {"mode": "mock", "booking_id": booking_id}


@api.get("/payments/verify/{reference}")
async def verify_payment(reference: str):
    booking = await db.bookings.find_one({"reference": reference}, {"_id": 0}) \
        or await db.bookings.find_one({"payment_reference": reference}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if not PAYSTACK_ENABLED:
        b = await confirm_booking(booking["id"], "MOCK-" + uuid.uuid4().hex[:12])
        return {"status": "success", "booking_id": booking["id"]}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.get(f"https://api.paystack.co/transaction/verify/{reference}",
                               headers={"Authorization": f"Bearer {PAYSTACK_SECRET}"})
        result = resp.json()
    except Exception as e:
        logger.error("Paystack verify error: %s", e)
        raise HTTPException(502, "Could not verify payment")
    if result.get("status") and result["data"]["status"] == "success":
        payment = result["data"]
        if payment.get("currency") != "GHS" or payment.get("amount") != int(round(booking["total"] * 100)):
            logger.error("Payment verification amount or currency mismatch for %s", reference)
            raise HTTPException(400, "Payment details do not match this booking")
        await confirm_booking(booking["id"], reference)
        return {"status": "success", "booking_id": booking["id"]}
    return {"status": "failed", "booking_id": booking["id"]}


@api.post("/payments/webhook")
async def paystack_webhook(request: Request):
    # Cron/webhook endpoints must ack quickly.
    if not PAYSTACK_ENABLED:
        return {"status": "ignored"}
    signature = request.headers.get("x-paystack-signature", "")
    raw = await request.body()
    computed = hmac.new(PAYSTACK_SECRET.encode(), raw, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(computed, signature):
        raise HTTPException(401, "Invalid signature")
    event = await request.json()
    if event.get("event") == "charge.success":
        payment = event["data"]
        ref = payment["reference"]
        booking = await db.bookings.find_one({"reference": ref}, {"_id": 0}) \
            or await db.bookings.find_one({"payment_reference": ref}, {"_id": 0})
        if booking and payment.get("currency") == "GHS" and payment.get("amount") == int(round(booking["total"] * 100)):
            await confirm_booking(booking["id"], ref)
        elif booking:
            logger.error("Paystack webhook amount or currency mismatch for %s", ref)
    return {"status": "ok"}


@api.post("/bookings/{booking_id}/pay")
async def pay_booking(booking_id: str):
    """Mock payment confirmation (used when Paystack keys are absent)."""
    if PAYSTACK_ENABLED:
        raise HTTPException(404, "Not found")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["status"] == "confirmed":
        return b
    if b["status"] != "pending_payment":
        raise HTTPException(400, "Booking cannot be paid in its current state")
    return await confirm_booking(booking_id, "MOCK-" + uuid.uuid4().hex[:12])


@api.get("/bookings/lookup")
async def lookup_booking(reference: str, contact: str):
    b = await db.bookings.find_one({"reference": reference.upper()}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    c = b["customer"]
    if contact.lower() not in [str(c.get("email", "")).lower(), str(c.get("phone", ""))]:
        raise HTTPException(403, "Contact does not match booking")
    b["refund"] = refund_info(b)
    return b


@api.get("/bookings/{booking_id}")
async def get_booking(booking_id: str):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    b["refund"] = refund_info(b)
    b["payout"] = payout_status(b)
    return b


@api.get("/me/bookings")
async def my_bookings(user: dict = Depends(get_current_user)):
    bs = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for b in bs:
        b["refund"] = refund_info(b)
    return bs


@api.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)):
    return await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/notifications/{notification_id}/read")
async def read_notification(notification_id: str, user: dict = Depends(get_current_user)):
    item = await db.notifications.find_one({"id": notification_id, "user_id": user["id"]}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Notification not found")
    await db.notifications.update_one({"id": notification_id}, {"$set": {"read_at": iso(now_utc())}})
    return {"status": "read"}


def authorize_booking_chat(b: dict, user: dict):
    if user["role"] == "admin":
        return
    if user["role"] == "owner" and b.get("owner_id") == user["id"]:
        return
    if user["role"] == "customer" and b.get("user_id") == user["id"]:
        return
    raise HTTPException(403, "You can only access conversations for your own bookings")


@api.get("/bookings/{booking_id}/messages")
async def booking_messages(booking_id: str, day: Optional[str] = None,
                           user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    authorize_booking_chat(b, user)
    query = {"booking_id": booking_id}
    if day:
        query["day"] = day
    messages = await db.booking_messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(250)
    days = await db.booking_messages.distinct("day", {"booking_id": booking_id})
    return {"messages": messages, "days": sorted(days, reverse=True)}


@api.post("/bookings/{booking_id}/messages")
async def post_booking_message(booking_id: str, body: BookingMessageIn,
                               user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    authorize_booking_chat(b, user)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty")
    created_at = now_utc()
    message = {
        "id": str(uuid.uuid4()), "booking_id": booking_id,
        "sender_id": user["id"], "sender_name": user.get("name", "GoTurf user"),
        "sender_role": user["role"], "text": text,
        "created_at": iso(created_at), "day": created_at.date().isoformat(),
    }
    await db.booking_messages.insert_one(message)
    recipient_id = b.get("owner_id") if user["id"] == b.get("user_id") else b.get("user_id")
    await notify(recipient_id, "message", f"New message about {b['turf_name']}", text, booking_id)
    if user["role"] == "owner" and not recipient_id:
        await send_sms(b.get("customer", {}).get("phone"), f"GoTurf message about {b['turf_name']}: {text}")
    return message


def authorize_booking(b: dict, user: Optional[dict], contact: Optional[str]):
    if user and (b.get("user_id") == user["id"] or user["role"] == "admin"):
        return
    c = b.get("customer", {})
    if contact and contact.lower() in [str(c.get("email", "")).lower(), str(c.get("phone", ""))]:
        return
    raise HTTPException(403, "Not authorized to manage this booking")


@api.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, contact: Optional[str] = None,
                         user: Optional[dict] = Depends(get_optional_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    authorize_booking(b, user, contact)
    if b["status"] not in ("confirmed", "pending_payment"):
        raise HTTPException(400, "Booking cannot be cancelled")
    info = refund_info(b)
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "status": "cancelled_by_customer", "payment_status": "refunded" if b["amount_paid"] else "pending",
        "cancellation": {"by": "customer", "at": iso(now_utc()),
                         "refund_amount": info["refund_amount"], "penalty": info["penalty"]}}})
    await audit("cancellation", booking_id,
                f"Customer cancelled {b['reference']}, refund GHS {info['refund_amount']}, penalty GHS {info['penalty']}")
    cust = b["customer"]
    if cust.get("email"):
        html = _email_shell("Booking cancelled", [
            f"Hi {escape(cust['name'])}, your booking {escape(b['reference'])} has been cancelled.",
            f"Refund due: GHS {info['refund_amount']:.2f}" + (f" (a GHS {info['penalty']} penalty applied)" if info['penalty'] else " (full refund)"),
        ])
        await send_email(to=cust["email"], subject=f"GoTurf booking {b['reference']} cancelled", html=html)
    return {"status": "cancelled", "refund": info}


@api.post("/bookings/{booking_id}/reschedule-request")
async def reschedule_request(booking_id: str, body: RescheduleIn, contact: Optional[str] = None,
                             user: Optional[dict] = Depends(get_optional_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    authorize_booking(b, user, contact)
    if b["status"] != "confirmed":
        raise HTTPException(400, "Only confirmed bookings can be rescheduled")
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "reschedule_request": {"new_date": body.new_date, "new_start_hour": body.new_start_hour,
                               "new_duration": body.new_duration, "status": "pending",
                               "requested_at": iso(now_utc())}}})
    await audit("reschedule", booking_id, f"Reschedule requested for {b['reference']}")
    return {"status": "requested"}


# ------------------------------------------------------------------ REVIEWS
@api.post("/turfs/{turf_id}/reviews")
async def add_review(turf_id: str, body: ReviewIn):
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b or b["turf_id"] != turf_id:
        raise HTTPException(404, "Booking not found for this turf")
    if parse_dt(b["end_datetime"]) > now_utc() or b["status"] != "confirmed":
        raise HTTPException(400, "You can review only after a completed booking")
    if await db.reviews.find_one({"booking_id": body.booking_id}):
        raise HTTPException(400, "You already reviewed this booking")
    doc = {"id": str(uuid.uuid4()), "turf_id": turf_id, "booking_id": body.booking_id,
           "author": b["customer"]["name"], "rating": max(1, min(5, body.rating)),
           "comment": body.comment, "created_at": iso(now_utc())}
    await db.reviews.insert_one(doc)
    return clean_turf(dict(doc))


# ------------------------------------------------------------------ OWNER
@api.get("/owner/overview")
async def owner_overview(user: dict = Depends(require_roles("owner", "admin"))):
    turfs = await db.turfs.find({"owner_id": user["id"]}, {"_id": 0}).to_list(200)
    bookings = await db.bookings.find({"owner_id": user["id"]}, {"_id": 0}).to_list(1000)
    confirmed = [b for b in bookings if b["status"] == "confirmed"]
    released = [b for b in confirmed if payout_status(b)["state"] == "released"]
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {
        "turf_count": len(turfs),
        "booking_count": len(bookings),
        "revenue": round(sum(payout_status(b)["net_payout"] for b in released), 2),
        "pending_payout": round(sum(payout_status(b)["net_payout"] for b in confirmed if payout_status(b)["state"] == "held"), 2),
        "strikes": u.get("strikes", 0),
        "suspended_until": u.get("suspended_until"),
        "penalty_balance": u.get("penalty_balance", 0),
        "verified": u.get("verified", False),
        "verification_status": u.get("verification_status", "unverified"),
    }


# ---- Owner payout account (bank / mobile money)
class PayoutMethodIn(BaseModel):
    type: Literal["bank", "momo"]
    account_name: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    momo_provider: Optional[str] = None
    momo_number: Optional[str] = None


@api.get("/owner/payout-method")
async def get_payout_method(user: dict = Depends(require_roles("owner", "admin"))):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return u.get("payout_method")


@api.post("/owner/payout-method")
async def set_payout_method(body: PayoutMethodIn, user: dict = Depends(require_roles("owner", "admin"))):
    pm = body.model_dump()
    if pm["type"] == "bank" and not (pm.get("bank_name") and pm.get("account_number")):
        raise HTTPException(400, "Bank name and account number are required")
    if pm["type"] == "momo" and not (pm.get("momo_provider") and pm.get("momo_number")):
        raise HTTPException(400, "Mobile money provider and number are required")
    pm["updated_at"] = iso(now_utc())
    await db.users.update_one({"id": user["id"]}, {"$set": {"payout_method": pm}})
    await audit("payout_method", user["id"], f"Owner {user['email']} updated payout method ({pm['type']})")
    return pm


# ---- Owner Ghana Card verification
@api.get("/owner/verification")
async def get_verification(user: dict = Depends(require_roles("owner", "admin"))):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    v = await db.verifications.find_one({"owner_id": user["id"]}, {"_id": 0})
    return {"verified": u.get("verified", False),
            "verification_status": u.get("verification_status", "unverified"),
            "submission": v}


@api.post("/owner/verification")
async def submit_verification(ghana_card_number: str = Form(...),
                              card_image: UploadFile = File(...),
                              selfie: UploadFile = File(...),
                              user: dict = Depends(require_roles("owner"))):
    async def _store(f: UploadFile, tag: str):
        ext = (f.filename.rsplit(".", 1)[-1] if "." in (f.filename or "") else "jpg").lower()
        path = f"{APP_NAME}/verifications/{user['id']}/{tag}-{uuid.uuid4()}.{ext}"
        data = await f.read()
        put_object(path, data, f.content_type or MIME_TYPES.get(ext, "image/jpeg"))
        return path
    card_path = await _store(card_image, "card")
    selfie_path = await _store(selfie, "selfie")
    doc = {"id": str(uuid.uuid4()), "owner_id": user["id"], "owner_name": user["name"],
           "owner_email": user["email"], "ghana_card_number": ghana_card_number,
           "card_path": card_path, "selfie_path": selfie_path,
           "status": "pending", "submitted_at": iso(now_utc())}
    await db.verifications.replace_one({"owner_id": user["id"]}, doc, upsert=True)
    await db.users.update_one({"id": user["id"]}, {"$set": {"verification_status": "pending"}})
    await audit("verification", user["id"], f"Owner {user['email']} submitted Ghana Card verification")
    return {"status": "pending"}


@api.get("/files/{path:path}")
async def serve_file(path: str, auth: Optional[str] = Query(None),
                     authorization: Optional[str] = Header(None)):
    token = None
    header = authorization or (f"Bearer {auth}" if auth else None)
    if header and header.startswith("Bearer "):
        token = header[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not u or u["role"] not in ("admin", "owner"):
        raise HTTPException(403, "Forbidden")
    if u["role"] == "owner" and not path.startswith(f"{APP_NAME}/verifications/{u['id']}/"):
        raise HTTPException(403, "Forbidden")
    try:
        data, ctype = get_object(path)
    except Exception:
        raise HTTPException(404, "File not found")
    return Response(content=data, media_type=ctype)


@api.get("/owner/turfs")
async def owner_turfs(user: dict = Depends(require_roles("owner", "admin"))):
    return await db.turfs.find({"owner_id": user["id"]}, {"_id": 0}).to_list(200)


@api.post("/owner/turfs/media")
async def upload_turf_media(request: Request, image: UploadFile = File(...),
                            user: dict = Depends(require_roles("owner", "admin"))):
    data = await image.read()
    try:
        ext = validate_turf_image(image.filename or "", image.content_type or "", data)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    path = f"{APP_NAME}/turfs/{user['id']}/{uuid.uuid4()}.{ext}"
    put_object(path, data, image.content_type)
    return {"url": f"{str(request.base_url).rstrip('/')}/api/media/{path}"}


@api.get("/media/{path:path}")
async def serve_turf_media(path: str):
    if not path.startswith(f"{APP_NAME}/turfs/"):
        raise HTTPException(404, "Image not found")
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(404, "Image not found")
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})


@api.post("/owner/turfs")
async def create_turf(body: TurfIn, user: dict = Depends(require_roles("owner", "admin"))):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if user["role"] == "owner" and not u.get("verified"):
        raise HTTPException(403, "Complete Ghana Card verification before publishing a turf")
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "owner_id": user["id"], "active": True,
                "created_at": iso(now_utc())})
    if not doc.get("packages"):
        doc["packages"] = DEFAULT_PACKAGES
    await db.turfs.insert_one(doc)
    return clean_turf(dict(doc))


@api.put("/owner/turfs/{turf_id}")
async def update_turf(turf_id: str, body: TurfIn, user: dict = Depends(require_roles("owner", "admin"))):
    t = await db.turfs.find_one({"id": turf_id}, {"_id": 0})
    if not t or (t["owner_id"] != user["id"] and user["role"] != "admin"):
        raise HTTPException(404, "Turf not found")
    await db.turfs.update_one({"id": turf_id}, {"$set": body.model_dump()})
    return await db.turfs.find_one({"id": turf_id}, {"_id": 0})


@api.get("/owner/bookings")
async def owner_bookings(user: dict = Depends(require_roles("owner", "admin"))):
    bs = await db.bookings.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for b in bs:
        b["payout"] = payout_status(b)
    return bs


@api.post("/owner/bookings/{booking_id}/reschedule-decision")
async def reschedule_decision(booking_id: str, approve: bool,
                              user: dict = Depends(require_roles("owner", "admin"))):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or not b.get("reschedule_request"):
        raise HTTPException(404, "No reschedule request found")
    rr = b["reschedule_request"]
    if approve:
        turf = await db.turfs.find_one({"id": b["turf_id"]}, {"_id": 0})
        if not turf:
            raise HTTPException(404, "Turf not found")
        start, end = booking_datetimes(turf, rr["new_date"], rr["new_start_hour"], rr["new_duration"])
        await db.bookings.update_one({"id": booking_id}, {"$set": {
            "date": rr["new_date"], "start_hour": rr["new_start_hour"], "duration": rr["new_duration"],
            "start_datetime": iso(start), "end_datetime": iso(end),
            "reschedule_request": {**rr, "status": "approved"}}})
        msg = "approved"
    else:
        await db.bookings.update_one({"id": booking_id}, {"$set": {
            "reschedule_request": {**rr, "status": "rejected"}}})
        msg = "rejected"
    await audit("reschedule", booking_id, f"Reschedule {msg} for {b['reference']}")
    return {"status": msg}


@api.post("/owner/bookings/{booking_id}/cancel")
async def owner_cancel(booking_id: str, body: OwnerCancelIn,
                       user: dict = Depends(require_roles("owner", "admin"))):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or (b["owner_id"] != user["id"] and user["role"] != "admin"):
        raise HTTPException(404, "Booking not found")
    if b["status"] != "confirmed":
        raise HTTPException(400, "Only confirmed bookings can be cancelled")
    if parse_dt(b["start_datetime"]) <= now_utc() + timedelta(minutes=30):
        raise HTTPException(400, "Bookings cannot be cancelled within 30 minutes of kickoff")
    if not body.understands_penalty or not body.accepts_terms:
        raise HTTPException(400, "Confirm the cancellation consequences and terms before continuing")
    # full refund + recovery coupon
    coupon_code = "SORRY-" + uuid.uuid4().hex[:5].upper()
    await db.coupons.insert_one({
        "id": str(uuid.uuid4()), "code": coupon_code, "discount_pct": OWNER_CANCEL_COUPON_PCT,
        "discount_amount": None, "turf_id": b["turf_id"],
        "expires_at": iso(now_utc() + timedelta(days=90)), "max_uses": 1, "uses": 0,
        "active": True, "created_at": iso(now_utc()), "reason": "owner_cancellation"})
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "status": "cancelled_by_owner", "payment_status": "refunded",
        "cancellation": {"by": "owner", "at": iso(now_utc()), "refund_amount": b["amount_paid"],
                         "penalty": 0, "reason": body.reason.strip(), "recovery_coupon": coupon_code}}})
    # strike engine
    owner = await db.users.find_one({"id": b["owner_id"]})
    strikes = owner.get("strikes", 0) + 1
    upd = {"strikes": strikes}
    note = f"Owner cancelled {b['reference']}; strike #{strikes}."
    if strikes >= STRIKE_THRESHOLD:
        upd["penalty_balance"] = owner.get("penalty_balance", 0) + STRIKE_PENALTY
        upd["suspended_until"] = iso(now_utc() + timedelta(days=SUSPENSION_DAYS))
        note += f" Threshold reached: GHS {STRIKE_PENALTY} penalty + {SUSPENSION_DAYS}-day suspension."
    await db.users.update_one({"id": b["owner_id"]}, {"$set": upd})
    await db.strikes.insert_one({"id": str(uuid.uuid4()), "owner_id": b["owner_id"],
                                 "booking_id": booking_id, "at": iso(now_utc()), "note": note})
    await audit("owner_cancel", booking_id, note)
    cust = b["customer"]
    if cust.get("email"):
        html = _email_shell("Your booking was cancelled by the owner", [
            f"Hi {escape(cust['name'])}, unfortunately the owner cancelled booking {escape(b['reference'])}.",
            f"You will receive a full refund of GHS {b['amount_paid']:.2f}.",
            f"Reason provided: {escape(body.reason.strip())}",
            f"As an apology, here is <strong>{OWNER_CANCEL_COUPON_PCT}% off</strong> your next booking at this turf: "
            f"code <strong>{escape(coupon_code)}</strong>.",
        ])
        await send_email(to=cust["email"], subject=f"GoTurf booking {b['reference']} cancelled by owner", html=html)
    await send_sms(cust.get("phone"), f"GoTurf: {b['turf_name']} cancelled your booking. Full refund: GHS {b['amount_paid']:.2f}. Reason: {body.reason.strip()}")
    await notify(b.get("user_id"), "booking_cancelled", "Booking cancelled by owner",
                 f"{b['turf_name']} was cancelled. A full refund of GHS {b['amount_paid']:.2f} is being processed.", booking_id)
    return {"status": "cancelled", "recovery_coupon": coupon_code, "strikes": strikes}


# ------------------------------------------------------------------ ADMIN
@api.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_roles("admin"))):
    bookings = await db.bookings.find({}, {"_id": 0}).to_list(5000)
    confirmed = [b for b in bookings if b["status"] == "confirmed"]
    gmv = sum(b.get("amount_paid", 0) for b in confirmed)
    return {
        "total_bookings": len(bookings),
        "confirmed": len(confirmed),
        "cancelled_customer": len([b for b in bookings if b["status"] == "cancelled_by_customer"]),
        "cancelled_owner": len([b for b in bookings if b["status"] == "cancelled_by_owner"]),
        "gmv": round(gmv, 2),
        "platform_fees": round(gmv * PLATFORM_FEE_PCT / 100, 2),
        "turfs": await db.turfs.count_documents({}),
        "owners": await db.users.count_documents({"role": "owner"}),
        "customers": await db.users.count_documents({"role": "customer"}),
        "open_disputes": await db.disputes.count_documents({"status": "open"}),
    }


@api.get("/admin/bookings")
async def admin_bookings(user: dict = Depends(require_roles("admin"))):
    bs = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for b in bs:
        b["payout"] = payout_status(b)
        b["refund"] = refund_info(b)
    return bs


@api.post("/admin/bookings/{booking_id}/refund")
async def admin_refund(booking_id: str, amount: float, user: dict = Depends(require_roles("admin"))):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "status": "refunded", "payment_status": "refunded",
        "cancellation": {"by": "admin", "at": iso(now_utc()), "refund_amount": amount, "penalty": 0}}})
    await audit("admin_refund", booking_id, f"Admin refunded GHS {amount} for {b['reference']}")
    return {"status": "refunded", "amount": amount}


@api.post("/admin/bookings/{booking_id}/hold")
async def admin_hold(booking_id: str, hold: bool, user: dict = Depends(require_roles("admin"))):
    await db.bookings.update_one({"id": booking_id}, {"$set": {"admin_hold": hold}})
    await audit("admin_hold", booking_id, f"Admin payout hold set to {hold}")
    return {"status": "ok", "admin_hold": hold}


@api.get("/admin/owners")
async def admin_owners(user: dict = Depends(require_roles("admin"))):
    owners = await db.users.find({"role": "owner"}, {"_id": 0, "password_hash": 0}).to_list(500)
    for o in owners:
        o["turf_count"] = await db.turfs.count_documents({"owner_id": o["id"]})
        o["suspended"] = bool(o.get("suspended_until") and parse_dt(o["suspended_until"]) > now_utc())
    return owners


@api.post("/admin/owners/{owner_id}/suspend")
async def admin_suspend(owner_id: str, suspend: bool, user: dict = Depends(require_roles("admin"))):
    val = iso(now_utc() + timedelta(days=SUSPENSION_DAYS)) if suspend else None
    await db.users.update_one({"id": owner_id}, {"$set": {"suspended_until": val}})
    await audit("suspension", owner_id, f"Owner {'suspended' if suspend else 'reinstated'} by admin")
    return {"status": "ok"}


@api.post("/admin/owners/{owner_id}/reset-strikes")
async def admin_reset_strikes(owner_id: str, user: dict = Depends(require_roles("admin"))):
    await db.users.update_one({"id": owner_id}, {"$set": {"strikes": 0, "suspended_until": None, "penalty_balance": 0}})
    await audit("strike_reset", owner_id, "Owner strikes reset by admin")
    return {"status": "ok"}


@api.get("/admin/disputes")
async def admin_disputes(user: dict = Depends(require_roles("admin"))):
    return await db.disputes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


class DisputeIn(BaseModel):
    booking_id: str
    reason: str


@api.post("/disputes")
async def create_dispute(body: DisputeIn):
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    doc = {"id": str(uuid.uuid4()), "booking_id": body.booking_id, "reference": b["reference"],
           "reason": body.reason, "status": "open", "created_at": iso(now_utc())}
    await db.disputes.insert_one(doc)
    await db.bookings.update_one({"id": body.booking_id}, {"$set": {"has_dispute": True}})
    await audit("dispute", body.booking_id, f"Dispute raised: {body.reason[:60]}")
    return clean_turf(dict(doc))


@api.post("/admin/disputes/{dispute_id}/resolve")
async def resolve_dispute(dispute_id: str, resolution: str, user: dict = Depends(require_roles("admin"))):
    d = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dispute not found")
    await db.disputes.update_one({"id": dispute_id}, {"$set": {
        "status": "resolved", "resolution": resolution, "resolved_at": iso(now_utc())}})
    await db.bookings.update_one({"id": d["booking_id"]}, {"$set": {"has_dispute": False}})
    await audit("dispute", d["booking_id"], f"Dispute resolved: {resolution[:60]}")
    return {"status": "resolved"}


@api.get("/admin/coupons")
async def admin_coupons(user: dict = Depends(require_roles("admin"))):
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/coupons")
async def admin_create_coupon(body: CouponIn, user: dict = Depends(require_roles("admin"))):
    if await db.coupons.find_one({"code": body.code.upper()}):
        raise HTTPException(400, "Coupon code already exists")
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "code": body.code.upper(), "uses": 0, "active": True,
                "created_at": iso(now_utc())})
    await db.coupons.insert_one(doc)
    return clean_turf(dict(doc))


@api.post("/admin/coupons/{coupon_id}/toggle")
async def toggle_coupon(coupon_id: str, user: dict = Depends(require_roles("admin"))):
    c = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Coupon not found")
    await db.coupons.update_one({"id": coupon_id}, {"$set": {"active": not c["active"]}})
    return {"status": "ok", "active": not c["active"]}


@api.get("/admin/audit-logs")
async def admin_audit(user: dict = Depends(require_roles("admin"))):
    return await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).to_list(500)


async def audit(kind: str, entity_id: str, message: str):
    await db.audit_logs.insert_one({"id": str(uuid.uuid4()), "kind": kind, "entity_id": entity_id,
                                    "message": message, "at": iso(now_utc())})


@api.get("/admin/verifications")
async def admin_verifications(user: dict = Depends(require_roles("admin"))):
    return await db.verifications.find({}, {"_id": 0}).sort("submitted_at", -1).to_list(500)


@api.post("/admin/verifications/{verification_id}/decision")
async def verification_decision(verification_id: str, approve: bool,
                                user: dict = Depends(require_roles("admin"))):
    v = await db.verifications.find_one({"id": verification_id}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Verification not found")
    status = "approved" if approve else "rejected"
    await db.verifications.update_one({"id": verification_id}, {"$set": {
        "status": status, "decided_at": iso(now_utc())}})
    await db.users.update_one({"id": v["owner_id"]}, {"$set": {
        "verified": approve, "verification_status": status}})
    await audit("verification", v["owner_id"], f"Owner {v['owner_email']} verification {status}")
    await send_email(to=v["owner_email"], subject=f"GoTurf verification {status}",
                     html=_email_shell(f"Verification {status}", [
                         f"Hi {escape(v['owner_name'])},",
                         f"Your GoTurf owner verification was <strong>{status}</strong>." +
                         (" You can now publish your turfs." if approve else " Please resubmit with clear documents.")])) \
        if v.get("owner_email") else None
    return {"status": status}


@api.post("/cron/send-reminders")
async def cron_send_reminders(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    token = (request.headers.get("Authorization") or "")[7:]
    if not WEBHOOK_CRON_SECRET or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "Unauthorized")
    now = now_utc()
    window_end = now + timedelta(hours=3)
    sent = 0
    bookings = await db.bookings.find(
        {"status": "confirmed", "reminded": {"$ne": True}}, {"_id": 0}).to_list(1000)
    for b in bookings:
        start = parse_dt(b["start_datetime"])
        if now < start <= window_end:
            cust = b["customer"]
            await send_sms(cust.get("phone"),
                           f"GoTurf reminder: {b['turf_name']} today at {b['start_hour']:02d}:00 "
                           f"for {b['duration']}h. Ref {b['reference']}.")
            if cust.get("email"):
                await send_email(to=cust["email"], subject=f"Reminder: your GoTurf session {b['reference']}",
                                 html=_email_shell("Your session is coming up", [
                                     f"Hi {escape(cust['name'])}, this is a reminder for your booking at "
                                     f"<strong>{escape(b['turf_name'])}</strong> today at {b['start_hour']:02d}:00.",
                                     f"Reference: <strong>{escape(b['reference'])}</strong>."]))
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"reminded": True}})
            sent += 1
    return {"status": "ok", "reminders_sent": sent}


@api.post("/cron/morning-reminders")
async def cron_morning_reminders(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    token = (request.headers.get("Authorization") or "")[7:]
    if not WEBHOOK_CRON_SECRET or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "Unauthorized")
    today = now_utc().strftime("%Y-%m-%d")
    sent = 0
    bookings = await db.bookings.find(
        {"status": "confirmed", "date": today, "morning_reminded": {"$ne": True}}, {"_id": 0}).to_list(2000)
    for b in bookings:
        cust = b["customer"]
        await send_sms(cust.get("phone"),
                       f"GoTurf: You're playing today at {b['turf_name']}, {b['start_hour']:02d}:00 "
                       f"for {b['duration']}h. Ref {b['reference']}. Have a great match!")
        if cust.get("email"):
            await send_email(to=cust["email"], subject=f"Today's match at {b['turf_name']}",
                             html=_email_shell("You're playing today", [
                                 f"Hi {escape(cust['name'])}, a quick heads-up that your GoTurf session is today at "
                                 f"<strong>{escape(b['turf_name'])}</strong>, {b['start_hour']:02d}:00 for {b['duration']}h.",
                                 f"Reference: <strong>{escape(b['reference'])}</strong>. See you on the turf!"]))
        await db.bookings.update_one({"id": b["id"]}, {"$set": {"morning_reminded": True}})
        sent += 1
    return {"status": "ok", "morning_reminders_sent": sent}


# ------------------------------------------------------------------ SEED
async def seed():
    await db.users.create_index("email", unique=True)
    await db.turfs.create_index("owner_id")
    await db.bookings.create_index("turf_id")

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"id": str(uuid.uuid4()), "name": "GoTurf Admin", "email": admin_email,
                                   "password_hash": hash_password(admin_pw), "role": "admin",
                                   "strikes": 0, "suspended_until": None, "penalty_balance": 0,
                                   "verified": True, "created_at": iso(now_utc())})
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})

    # seeded owner + customer
    owner = await db.users.find_one({"email": "owner@goturf.gh"})
    if not owner:
        owner_id = str(uuid.uuid4())
        await db.users.insert_one({"id": owner_id, "name": "Kwame Mensah", "email": "owner@goturf.gh",
                                   "password_hash": hash_password("REDACTED_DO_NOT_USE"), "role": "owner",
                                   "strikes": 0, "suspended_until": None, "penalty_balance": 0,
                                   "verified": True, "verification_status": "approved",
                                   "created_at": iso(now_utc())})
    else:
        owner_id = owner["id"]
    if not await db.users.find_one({"email": "customer@goturf.gh"}):
        await db.users.insert_one({"id": str(uuid.uuid4()), "name": "Ama Owusu", "email": "customer@goturf.gh",
                                   "password_hash": hash_password("REDACTED_DO_NOT_USE"), "role": "customer",
                                   "strikes": 0, "suspended_until": None, "penalty_balance": 0,
                                   "verified": True, "created_at": iso(now_utc())})

    if await db.turfs.count_documents({}) == 0:
        imgs = {
            "a": ["https://images.unsplash.com/photo-1784984914504-0d991709dcac?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
                  "https://images.pexels.com/photos/15521639/pexels-photo-15521639.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
                  "https://images.unsplash.com/photo-1785528469373-1103f69c2943?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"],
            "b": ["https://images.unsplash.com/photo-1487466365202-1afdb86c764e?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
                  "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
                  "https://images.unsplash.com/photo-1652190416554-c46af8a0ff50?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"],
            "c": ["https://images.unsplash.com/photo-1616402455727-ecfb0eab4867?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
                  "https://images.unsplash.com/photo-1652190364244-96ad73c21c4c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
                  "https://images.unsplash.com/photo-1723272156032-1eac173d47b5?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"],
            "d": ["https://images.unsplash.com/photo-1760174053338-4def27153cb7?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
                  "https://images.unsplash.com/photo-1712418516923-527799fb2bec?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"],
        }
        rules = ["No metal studs — moulded boots or trainers only", "Arrive 10 minutes before your slot",
                 "No food or drinks on the pitch", "Maximum players as per booked format",
                 "Respect the next booking — vacate on time"]
        samples = [
            {"name": "Legon Astro Arena", "neighborhood": "East Legon", "location": "Lagos Avenue, East Legon, Accra",
             "turf_type": "5-a-side", "playing_format": "5v5", "images": imgs["a"],
             "amenities": ["Floodlights", "Changing Rooms", "Parking", "Water", "Spectator Seating"],
             "base_hourly": 180, "peak_hourly": 240, "weekend_hourly": 260, "lat": 5.635, "lng": -0.166},
            {"name": "Osu Beachside Pitch", "neighborhood": "Osu", "location": "Oxford Street, Osu, Accra",
             "turf_type": "7-a-side", "playing_format": "7v7", "images": imgs["b"],
             "amenities": ["Floodlights", "Showers", "Cafeteria", "Parking", "First Aid"],
             "base_hourly": 220, "peak_hourly": 300, "weekend_hourly": 320, "lat": 5.556, "lng": -0.182},
            {"name": "Spintex Green Field", "neighborhood": "Spintex", "location": "Spintex Road, Accra",
             "turf_type": "11-a-side", "playing_format": "11v11", "images": imgs["c"],
             "amenities": ["Floodlights", "Changing Rooms", "Parking", "Equipment Rental", "Water"],
             "base_hourly": 350, "peak_hourly": 450, "weekend_hourly": 500, "lat": 5.624, "lng": -0.097},
            {"name": "Tema Harbour Turf", "neighborhood": "Tema", "location": "Community 1, Tema, Accra",
             "turf_type": "5-a-side", "playing_format": "5v5", "images": imgs["a"],
             "amenities": ["Floodlights", "Water", "Parking"],
             "base_hourly": 150, "peak_hourly": 190, "weekend_hourly": 210, "lat": 5.667, "lng": -0.016},
            {"name": "Dansoman Indoor Dome", "neighborhood": "Dansoman", "location": "Exhibition Rd, Dansoman, Accra",
             "turf_type": "Futsal", "playing_format": "Futsal 5v5", "images": imgs["d"],
             "amenities": ["Indoor", "Floodlights", "Changing Rooms", "Water", "WiFi", "Cafeteria"],
             "base_hourly": 200, "peak_hourly": 260, "weekend_hourly": 280, "lat": 5.535, "lng": -0.270},
            {"name": "Achimota Sports Hub", "neighborhood": "Achimota", "location": "Achimota, Accra",
             "turf_type": "7-a-side", "playing_format": "7v7", "images": imgs["c"],
             "amenities": ["Floodlights", "Parking", "Spectator Seating", "First Aid", "Water"],
             "base_hourly": 190, "peak_hourly": 250, "weekend_hourly": 270, "lat": 5.615, "lng": -0.223},
        ]
        for s in samples:
            s.update({"id": str(uuid.uuid4()), "owner_id": owner_id, "active": True,
                      "description": f"Premium {s['turf_type']} AstroTurf in {s['neighborhood']}, Accra. "
                                     f"Floodlit, well-maintained and ready for your next match.",
                      "rules": rules, "peak_hours": [17, 18, 19, 20, 21], "open_hour": 6, "close_hour": 23,
                      "packages": DEFAULT_PACKAGES, "created_at": iso(now_utc())})
            await db.turfs.insert_one(s)
        logger.info("Seeded %d turfs", len(samples))


@app.on_event("startup")
async def _startup():
    await db.connect()
    if not S3_BUCKET:
        logger.info("Object storage not configured; uploads are stored locally in backend/uploads")
    await seed()


@api.get("/")
async def root():
    return {"service": "GoTurf API", "status": "ok"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    await db.close()
