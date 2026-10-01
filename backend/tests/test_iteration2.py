"""GoTurf iteration-2 tests: payments mock, verification flow, file serving, cron."""
import io
import os
import uuid
import struct
import zlib
import pytest
import requests

with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "kpomsgh@gmail.com", "password": "REDACTED_DO_NOT_USE"}
CRON_SECRET = "REDACTED_TEST_SECRET"


def _png_bytes():
    """Minimal valid 1x1 PNG."""
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_tok(s):
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def turf_id(s):
    r = s.get(f"{API}/turfs", timeout=30)
    assert r.status_code == 200
    return r.json()[0]["id"]


# -------- Payments config --------
def test_payments_config_mock(s):
    r = s.get(f"{API}/payments/config", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["provider"] == "mock"
    assert j["sms_enabled"] is False
    assert j["public_key"] in (None, "")


# -------- Checkout mock flow --------
@pytest.fixture(scope="module")
def booking(s, turf_id):
    # future dated, non-overlapping-ish slot
    from datetime import datetime, timedelta, timezone
    import random
    d = (datetime.now(timezone.utc) + timedelta(days=random.randint(10, 60))).strftime("%Y-%m-%d")
    sh = random.randint(6, 20)
    payload = {
        "turf_id": turf_id, "date": d, "start_hour": sh, "duration": 1,
        "customer": {"name": "TEST Pay", "email": f"test_{uuid.uuid4().hex[:6]}@goturf.gh",
                     "phone": "+233200000000"},
    }
    r = s.post(f"{API}/bookings", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_checkout_mock_confirms(s, booking):
    r = s.post(f"{API}/bookings/{booking['id']}/checkout",
               json={"customer": booking["customer"], "coupon_code": None,
                     "callback_url": "https://example.gh/cb"}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["mode"] == "mock"
    # verify persisted
    g = s.get(f"{API}/bookings/{booking['id']}", timeout=30)
    assert g.status_code == 200
    gb = g.json()
    assert gb["status"] == "confirmed"
    assert gb["amount_paid"] > 0
    assert gb["payment_status"] == "paid"


def test_payment_verify_mock(s, booking):
    r = s.get(f"{API}/payments/verify/{booking['reference']}", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "success"
    assert j["booking_id"] == booking["id"]


# -------- Owner verification gating --------
@pytest.fixture(scope="module")
def new_owner(s):
    email = f"test_owner_{uuid.uuid4().hex[:8]}@goturf.gh"
    r = s.post(f"{API}/auth/register",
               json={"name": "TEST Owner", "email": email, "password": "REDACTED_DO_NOT_USE",
                     "role": "owner"}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["role"] == "owner"
    assert j["user"]["verified"] is False
    return {"email": email, "token": j["token"], "user": j["user"]}


def test_unverified_owner_blocked_from_create_turf(s, new_owner):
    turf_payload = {"name": "TEST Turf", "location": "Accra", "neighborhood": "East Legon"}
    r = s.post(f"{API}/owner/turfs", json=turf_payload,
               headers={"Authorization": f"Bearer {new_owner['token']}"}, timeout=30)
    assert r.status_code == 403
    assert "verification" in r.text.lower()


def test_submit_verification(s, new_owner):
    img = _png_bytes()
    files = {
        "card_image": ("card.png", io.BytesIO(img), "image/png"),
        "selfie": ("selfie.png", io.BytesIO(img), "image/png"),
    }
    data = {"ghana_card_number": "GHA-123456789-0"}
    r = s.post(f"{API}/owner/verification", data=data, files=files,
               headers={"Authorization": f"Bearer {new_owner['token']}"}, timeout=60)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"
    # GET returns pending
    g = s.get(f"{API}/owner/verification",
              headers={"Authorization": f"Bearer {new_owner['token']}"}, timeout=30)
    assert g.status_code == 200
    gj = g.json()
    assert gj["verification_status"] == "pending"
    assert gj["submission"] is not None
    assert gj["submission"]["ghana_card_number"] == "GHA-123456789-0"
    new_owner["card_path"] = gj["submission"]["card_path"]


def test_admin_sees_pending_submission(s, admin_tok, new_owner):
    r = s.get(f"{API}/admin/verifications",
              headers={"Authorization": f"Bearer {admin_tok}"}, timeout=30)
    assert r.status_code == 200
    subs = r.json()
    match = [v for v in subs if v["owner_email"] == new_owner["email"]]
    assert len(match) == 1
    assert match[0]["status"] == "pending"
    new_owner["verification_id"] = match[0]["id"]


def test_file_requires_auth(s, new_owner):
    path = new_owner.get("card_path")
    if not path:
        pytest.skip("no card_path")
    # No auth -> 401
    r = s.get(f"{API}/files/{path}", timeout=30)
    assert r.status_code == 401


def test_file_served_to_admin(s, admin_tok, new_owner):
    path = new_owner.get("card_path")
    if not path:
        pytest.skip("no card_path")
    r = s.get(f"{API}/files/{path}", params={"auth": admin_tok}, timeout=60)
    assert r.status_code == 200
    assert r.headers.get("Content-Type", "").startswith("image/")
    assert len(r.content) > 50


def test_admin_approve_verification(s, admin_tok, new_owner):
    vid = new_owner["verification_id"]
    r = s.post(f"{API}/admin/verifications/{vid}/decision",
               params={"approve": True},
               headers={"Authorization": f"Bearer {admin_tok}"}, timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


def test_verified_owner_can_create_turf(s, new_owner):
    r = s.post(f"{API}/owner/turfs",
               json={"name": "TEST Verified Turf", "location": "Accra",
                     "neighborhood": "East Legon"},
               headers={"Authorization": f"Bearer {new_owner['token']}"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    j = r.json()
    assert j["name"] == "TEST Verified Turf"
    assert j["owner_id"] == new_owner["user"]["id"]
    new_owner["created_turf_id"] = j["id"]


# -------- Cron reminders --------
def test_cron_requires_auth(s):
    r = s.post(f"{API}/cron/send-reminders", timeout=30)
    assert r.status_code == 401


def test_cron_with_secret(s):
    r = s.post(f"{API}/cron/send-reminders",
               headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert "reminders_sent" in j
    assert isinstance(j["reminders_sent"], int)


# -------- cleanup --------
def test_cleanup(s, admin_tok, new_owner):
    # delete created test turf by admin
    tid = new_owner.get("created_turf_id")
    if tid:
        # no admin delete endpoint; mark via mongo not available via API -> leave
        pass
