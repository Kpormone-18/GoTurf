"""GoTurf backend regression tests."""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # Fallback to reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

ADMIN = {"email": "kpomsgh@gmail.com", "password": "REDACTED_DO_NOT_USE"}
OWNER = {"email": "owner@goturf.gh", "password": "REDACTED_DO_NOT_USE"}
CUSTOMER = {"email": "customer@goturf.gh", "password": "REDACTED_DO_NOT_USE"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _token(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_tok(s): return _token(s, ADMIN)


@pytest.fixture(scope="session")
def owner_tok(s): return _token(s, OWNER)


@pytest.fixture(scope="session")
def customer_tok(s): return _token(s, CUSTOMER)


@pytest.fixture(scope="session")
def turfs(s):
    r = s.get(f"{API}/turfs", timeout=30)
    assert r.status_code == 200
    return r.json()


# ---------- Health / Public ----------
def test_root(s):
    r = s.get(f"{API}/", timeout=30)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_list_turfs_seeded(turfs):
    assert isinstance(turfs, list)
    assert len(turfs) >= 6
    for t in turfs:
        assert "id" in t and "name" in t and "base_hourly" in t


def test_neighborhoods(s):
    r = s.get(f"{API}/turfs/neighborhoods", timeout=30)
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_search_filter(s):
    r = s.get(f"{API}/turfs", params={"q": "Osu"}, timeout=30)
    assert r.status_code == 200
    assert all("Osu" in (t["name"] + t["location"] + t["neighborhood"]) for t in r.json())


def test_filter_by_neighborhood_and_type(s):
    r = s.get(f"{API}/turfs", params={"neighborhood": "East Legon"}, timeout=30)
    assert r.status_code == 200
    for t in r.json():
        assert t["neighborhood"] == "East Legon"
    r2 = s.get(f"{API}/turfs", params={"turf_type": "Futsal"}, timeout=30)
    assert r2.status_code == 200
    for t in r2.json():
        assert t["turf_type"] == "Futsal"


def test_filter_by_amenity(s):
    r = s.get(f"{API}/turfs", params={"amenity": "Floodlights"}, timeout=30)
    assert r.status_code == 200
    for t in r.json():
        assert "Floodlights" in t["amenities"]


def test_turf_detail(s, turfs):
    t = turfs[0]
    r = s.get(f"{API}/turfs/{t['id']}", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == t["id"]
    assert "reviews" in d


def test_availability(s, turfs):
    date = (datetime.now(timezone.utc).date() + timedelta(days=2)).isoformat()
    r = s.get(f"{API}/turfs/{turfs[0]['id']}/availability", params={"date": date}, timeout=30)
    assert r.status_code == 200
    assert "booked_hours" in r.json() and "peak_hours" in r.json()


def test_quote_pricing(s, turfs):
    """peak hour higher than off-peak; package discount applies."""
    tid = turfs[0]["id"]
    # Pick a weekday in future
    d = datetime.now(timezone.utc).date()
    while d.weekday() >= 5:
        d += timedelta(days=1)
    d += timedelta(days=3)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    date = d.isoformat()
    off = s.get(f"{API}/turfs/{tid}/quote",
                params={"date": date, "start_hour": 9, "duration": 1}, timeout=30).json()
    peak = s.get(f"{API}/turfs/{tid}/quote",
                 params={"date": date, "start_hour": 18, "duration": 1}, timeout=30).json()
    assert peak["total"] > off["total"], f"peak {peak} not greater than off {off}"
    # package 3-hour at 10% discount
    pkg = s.get(f"{API}/turfs/{tid}/quote",
                params={"date": date, "start_hour": 9, "duration": 3, "is_package": "true"},
                timeout=30).json()
    nopkg = s.get(f"{API}/turfs/{tid}/quote",
                  params={"date": date, "start_hour": 9, "duration": 3, "is_package": "false"},
                  timeout=30).json()
    assert pkg["total"] < nopkg["total"]
    assert pkg["package_discount_pct"] > 0


# ---------- Auth ----------
def test_login_valid(s):
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["role"] == "admin"
    assert data["user"]["email"] == ADMIN["email"]


def test_login_invalid(s):
    r = s.post(f"{API}/auth/login", json={"email": "nope@nope.co", "password": "x"}, timeout=30)
    assert r.status_code == 401


def test_me(s, customer_tok):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {customer_tok}"}, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == CUSTOMER["email"]
    assert "password_hash" not in r.json()


def test_register_and_duplicate(s):
    email = f"TEST_{uuid.uuid4().hex[:8]}@goturf.gh"
    body = {"name": "TEST User", "email": email, "password": "pw12345678", "role": "customer"}
    r = s.post(f"{API}/auth/register", json=body, timeout=30)
    assert r.status_code == 200
    assert "token" in r.json()
    r2 = s.post(f"{API}/auth/register", json=body, timeout=30)
    assert r2.status_code == 400


# ---------- Guest booking flow ----------
def _future_date_time():
    d = datetime.now(timezone.utc).date() + timedelta(days=7)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.isoformat()


@pytest.fixture(scope="module")
def guest_booking(s, turfs):
    tid = turfs[0]["id"]
    date = _future_date_time()
    # Find a free slot by looking at availability
    av = s.get(f"{API}/turfs/{tid}/availability", params={"date": date}, timeout=30).json()
    booked = set(av["booked_hours"])
    start = next(h for h in range(av["open_hour"], av["close_hour"] - 1)
                 if h not in booked and (h + 1) not in booked and h not in av["peak_hours"])
    body = {
        "turf_id": tid, "date": date, "start_hour": start, "duration": 1,
        "customer": {"name": "TEST Guest", "email": "TEST_guest@goturf.gh", "phone": "+233200000000"},
    }
    r = s.post(f"{API}/bookings", json=body, timeout=30)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["status"] == "pending_payment"
    assert b["reference"].startswith("GT-")
    return b


def test_booking_overlap_409(s, guest_booking):
    body = {
        "turf_id": guest_booking["turf_id"], "date": guest_booking["date"],
        "start_hour": guest_booking["start_hour"], "duration": 1,
        "customer": {"name": "TEST Other", "email": "o@owner.co", "phone": "+233200000111"},
    }
    r = s.post(f"{API}/bookings", json=body, timeout=30)
    assert r.status_code == 409


def test_booking_contact_update(s, guest_booking):
    r = s.post(f"{API}/bookings/{guest_booking['id']}/contact",
               json={"customer": {"name": "TEST Guest Updated",
                                  "email": "TEST_guest@goturf.gh", "phone": "+233200000000"}},
               timeout=30)
    assert r.status_code == 200
    assert r.json()["customer"]["name"] == "TEST Guest Updated"


def test_booking_pay(s, guest_booking):
    r = s.post(f"{API}/bookings/{guest_booking['id']}/pay", timeout=30)
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "confirmed"
    assert b["amount_paid"] > 0
    assert b["payment_status"] == "paid"


def test_lookup_booking(s, guest_booking):
    r = s.get(f"{API}/bookings/lookup",
              params={"reference": guest_booking["reference"], "contact": "TEST_guest@goturf.gh"},
              timeout=30)
    assert r.status_code == 200
    assert r.json()["id"] == guest_booking["id"]
    r2 = s.get(f"{API}/bookings/lookup",
               params={"reference": guest_booking["reference"], "contact": "wrong@wrong.co"}, timeout=30)
    assert r2.status_code == 403


def test_cancel_booking_refund(s, guest_booking):
    r = s.post(f"{API}/bookings/{guest_booking['id']}/cancel",
               params={"contact": "TEST_guest@goturf.gh"}, timeout=30)
    assert r.status_code == 200
    info = r.json()["refund"]
    assert "refund_amount" in info
    # Just-cancelled near creation: within full-refund window (first 25% of created->kickoff)
    # Hard to be deterministic; just assert field types.
    assert info["penalty"] in (0, 30)


def test_cancel_penalty_logic():
    """Unit-level sanity: penalty should be 30 when outside full-refund window."""
    from backend.server import refund_info
    now = datetime.now(timezone.utc)
    created = (now - timedelta(hours=10)).isoformat()
    start = (now + timedelta(hours=1)).isoformat()  # 11h gap, 25% = 2.75h, we're beyond that
    b = {"created_at": created, "start_datetime": start, "amount_paid": 200, "total": 200}
    info = refund_info(b, at=now)
    assert info["full_refund_available"] is False
    assert info["penalty"] == 30


# ---------- Registered customer ----------
def test_me_bookings(s, customer_tok):
    r = s.get(f"{API}/me/bookings", headers={"Authorization": f"Bearer {customer_tok}"}, timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_reschedule_future_booking_requires_confirmed(s, guest_booking):
    # guest_booking is now cancelled; so expect 400
    r = s.post(f"{API}/bookings/{guest_booking['id']}/reschedule-request",
               json={"new_date": _future_date_time(), "new_start_hour": 10, "new_duration": 1},
               params={"contact": "TEST_guest@goturf.gh"},
               timeout=30)
    assert r.status_code == 400


# ---------- Owner ----------
def test_owner_overview(s, owner_tok):
    r = s.get(f"{API}/owner/overview", headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["turf_count"] >= 6
    assert "revenue" in d and "pending_payout" in d and "strikes" in d


def test_owner_turfs(s, owner_tok):
    r = s.get(f"{API}/owner/turfs", headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert r.status_code == 200
    assert len(r.json()) >= 6


def test_owner_create_and_edit_turf(s, owner_tok):
    body = {"name": "TEST Turf", "location": "Test Loc", "neighborhood": "East Legon",
            "turf_type": "5-a-side", "amenities": ["Water"]}
    h = {"Authorization": f"Bearer {owner_tok}"}
    r = s.post(f"{API}/owner/turfs", json=body, headers=h, timeout=30)
    assert r.status_code == 200
    tid = r.json()["id"]
    body["name"] = "TEST Turf Edited"
    r2 = s.put(f"{API}/owner/turfs/{tid}", json=body, headers=h, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["name"] == "TEST Turf Edited"


def test_owner_bookings_has_payout(s, owner_tok):
    r = s.get(f"{API}/owner/bookings", headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert r.status_code == 200
    for b in r.json()[:5]:
        assert "payout" in b and "state" in b["payout"]


# ---------- Admin ----------
def test_admin_stats(s, admin_tok):
    r = s.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {admin_tok}"}, timeout=30)
    assert r.status_code == 200
    for k in ("total_bookings", "gmv", "platform_fees", "turfs", "owners", "customers"):
        assert k in r.json()


def test_admin_nonadmin_blocked(s, customer_tok, owner_tok):
    for tok in (customer_tok, owner_tok):
        r = s.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 403


def test_admin_bookings_owners(s, admin_tok):
    h = {"Authorization": f"Bearer {admin_tok}"}
    assert s.get(f"{API}/admin/bookings", headers=h, timeout=30).status_code == 200
    assert s.get(f"{API}/admin/owners", headers=h, timeout=30).status_code == 200
    assert s.get(f"{API}/admin/disputes", headers=h, timeout=30).status_code == 200
    assert s.get(f"{API}/admin/audit-logs", headers=h, timeout=30).status_code == 200


def test_admin_coupon_create_toggle(s, admin_tok):
    h = {"Authorization": f"Bearer {admin_tok}"}
    code = f"TEST{uuid.uuid4().hex[:6].upper()}"
    r = s.post(f"{API}/admin/coupons", json={"code": code, "discount_pct": 10}, headers=h, timeout=30)
    assert r.status_code == 200
    cid = r.json()["id"]
    r2 = s.post(f"{API}/admin/coupons/{cid}/toggle", headers=h, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["active"] is False


# ---------- Review guard ----------
def test_review_rejected_for_future_booking(s, turfs):
    # Create+pay a future booking, then try to review -> should fail (end in future)
    tid = turfs[1]["id"]
    date = _future_date_time()
    av = s.get(f"{API}/turfs/{tid}/availability", params={"date": date}, timeout=30).json()
    booked = set(av["booked_hours"])
    start = next(h for h in range(av["open_hour"], av["close_hour"] - 1) if h not in booked and (h + 1) not in booked)
    body = {"turf_id": tid, "date": date, "start_hour": start, "duration": 1,
            "customer": {"name": "TEST Rev", "email": "review@review.co", "phone": "+233200000222"}}
    b = s.post(f"{API}/bookings", json=body, timeout=30).json()
    s.post(f"{API}/bookings/{b['id']}/pay", timeout=30)
    r = s.post(f"{API}/turfs/{tid}/reviews",
               json={"booking_id": b["id"], "rating": 5, "comment": "nice"}, timeout=30)
    assert r.status_code == 400
