"""GoTurf iteration-3 tests: Paystack live-test mode, payout methods, morning reminders cron, webhook."""
import hmac
import hashlib
import json
import os
import uuid
import random
from datetime import datetime, timedelta, timezone
import pytest
import requests

with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

PAYSTACK_SECRET = ""
with open("/app/backend/.env") as f:
    for line in f:
        if line.startswith("PAYSTACK_SECRET_KEY="):
            PAYSTACK_SECRET = line.split("=", 1)[1].strip().strip('"').strip("'")

OWNER = {"email": "owner@goturf.gh", "password": "REDACTED_DO_NOT_USE"}
ADMIN = {"email": "kpomsgh@gmail.com", "password": "REDACTED_DO_NOT_USE"}
CUSTOMER = {"email": "customer@goturf.gh", "password": "REDACTED_DO_NOT_USE"}
CRON_SECRET = "REDACTED_TEST_SECRET"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def owner_tok(s):
    r = s.post(f"{API}/auth/login", json=OWNER, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


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


# ----- Paystack config -----
def test_payments_config_paystack():
    r = requests.get(f"{API}/payments/config", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["provider"] == "paystack", f"Expected paystack, got {j}"


# ----- Checkout init -----
def _create_booking(s, turf_id):
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


@pytest.fixture(scope="module")
def paystack_booking(s, turf_id):
    return _create_booking(s, turf_id)


def test_paystack_checkout_init(s, paystack_booking):
    r = s.post(f"{API}/bookings/{paystack_booking['id']}/checkout",
               json={"customer": paystack_booking["customer"],
                     "callback_url": "https://example.gh/cb"}, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["mode"] == "paystack", j
    assert j["authorization_url"].startswith("https://checkout.paystack.com/"), j
    assert "reference" in j and len(j["reference"]) > 0
    # Booking stays pending_payment
    g = s.get(f"{API}/bookings/{paystack_booking['id']}", timeout=30)
    assert g.status_code == 200
    gb = g.json()
    assert gb["status"] == "pending_payment", gb


def test_paystack_verify_unpaid(s, paystack_booking):
    # Transaction never completed -> failed
    r = s.get(f"{API}/payments/verify/{paystack_booking['reference']}", timeout=60)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "failed", j
    # Booking should still not be confirmed
    g = s.get(f"{API}/bookings/{paystack_booking['id']}", timeout=30)
    assert g.json()["status"] == "pending_payment"


# ----- Webhook -----
def test_webhook_invalid_signature(s):
    body = json.dumps({"event": "charge.success", "data": {"reference": "XYZ"}})
    r = s.post(f"{API}/payments/webhook",
               data=body,
               headers={"x-paystack-signature": "deadbeef",
                        "Content-Type": "application/json"}, timeout=30)
    assert r.status_code == 401


def test_webhook_valid_signature_confirms(s, turf_id):
    assert PAYSTACK_SECRET, "No PAYSTACK_SECRET_KEY in backend/.env"
    # fresh pending booking + checkout init so reference is tracked
    b = _create_booking(s, turf_id)
    ci = s.post(f"{API}/bookings/{b['id']}/checkout",
                json={"customer": b["customer"],
                      "callback_url": "https://example.gh/cb"}, timeout=60)
    assert ci.status_code == 200
    ref = ci.json()["reference"]

    body = json.dumps({"event": "charge.success", "data": {"reference": ref}}).encode()
    sig = hmac.new(PAYSTACK_SECRET.encode(), body, hashlib.sha512).hexdigest()
    r = s.post(f"{API}/payments/webhook", data=body,
               headers={"x-paystack-signature": sig,
                        "Content-Type": "application/json"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("status") == "ok"
    # Booking should now be confirmed
    g = s.get(f"{API}/bookings/{b['id']}", timeout=30)
    gb = g.json()
    assert gb["status"] == "confirmed", gb
    assert gb.get("payment_status") == "paid"


# ----- Owner payout method -----
def test_payout_momo_missing_number_400(s, owner_tok):
    r = s.post(f"{API}/owner/payout-method",
               json={"type": "momo", "account_name": "Test Owner",
                     "momo_provider": "MTN"},  # missing momo_number
               headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert r.status_code == 400, r.text


def test_payout_momo_success(s, owner_tok):
    body = {"type": "momo", "account_name": "GoTurf Owner",
            "momo_provider": "MTN", "momo_number": "0244123456"}
    r = s.post(f"{API}/owner/payout-method", json=body,
               headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["type"] == "momo"
    assert j["momo_number"] == "0244123456"
    # GET returns it
    g = s.get(f"{API}/owner/payout-method",
              headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert g.status_code == 200
    gj = g.json()
    assert gj["type"] == "momo"
    assert gj["momo_provider"] == "MTN"
    assert gj["momo_number"] == "0244123456"


def test_payout_bank_missing_account_number_400(s, owner_tok):
    r = s.post(f"{API}/owner/payout-method",
               json={"type": "bank", "account_name": "Test Owner",
                     "bank_name": "Ecobank"},  # missing account_number
               headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert r.status_code == 400, r.text


def test_payout_bank_success(s, owner_tok):
    body = {"type": "bank", "account_name": "GoTurf Owner",
            "bank_name": "Ecobank", "account_number": "0123456789"}
    r = s.post(f"{API}/owner/payout-method", json=body,
               headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["type"] == "bank"
    assert j["bank_name"] == "Ecobank"
    assert j["account_number"] == "0123456789"
    g = s.get(f"{API}/owner/payout-method",
              headers={"Authorization": f"Bearer {owner_tok}"}, timeout=30)
    assert g.json()["type"] == "bank"


# ----- Smart reminders -----
def test_morning_reminders_requires_auth(s):
    r = s.post(f"{API}/cron/morning-reminders", timeout=30)
    assert r.status_code == 401


def test_morning_reminders_with_secret(s):
    r = s.post(f"{API}/cron/morning-reminders",
               headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert "morning_reminders_sent" in j
    assert isinstance(j["morning_reminders_sent"], int)


def test_send_reminders_still_works(s):
    r = s.post(f"{API}/cron/send-reminders",
               headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert "reminders_sent" in j
