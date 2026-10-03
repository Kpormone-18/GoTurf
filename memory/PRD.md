# GoTurf — Product Requirements (living doc)

## Original problem statement
Web marketplace for booking AstroTurf pitches in Accra, Ghana. V1 prioritises sports bookings; events are secondary (V2). Solves informal/double booking, poor visibility and payment-trust via escrow-held funds released to owners after the session ends (minus a short dispute hold).

## Stack (as built)
- Frontend: React 19 (CRA/craco), Tailwind, shadcn/ui, Cabinet Grotesk + Manrope, framer-motion available.
- Backend: FastAPI + MongoDB (motor). JWT Bearer auth (localStorage), bcrypt hashing.
- Email: Resend (Emergent-managed) for booking confirmations / cancellations / owner-cancel notices.
- Payments: MOCKED (`POST /api/bookings/{id}/pay` simulates Paystack success). Paystack to be wired in V1.1.
> Note: PRD mentioned NestJS/PostgreSQL; platform runs React+FastAPI+MongoDB (PRD-endorsed) — built on that.

## Locked business rules
- Geography: Accra only. Currency GHS (₵). Times UTC (Ghana = GMT+0).
- Instant confirmation after payment; funds escrowed; payout releases 30 min after booking end unless dispute/admin hold.
- Platform fee: 10% of amount paid.
- Cancellation: full refund if cancelled within the first 1/4 of (kickoff − booking time); after that GHS 30 penalty. No-show = non-refundable.
- Owner cancellation: full customer refund + 20% recovery coupon for same turf + a strike.
- Strikes: threshold 5 → GHS 200 penalty + 14-day suspension. Admin can reset strikes / suspend / reinstate.
- Packages: 3h/6h/12h/15h/24h with owner discounts (default 10/15/20/22/30%). Peak hours 17–21 and weekends priced higher.

## Roles
guest, customer, owner, admin (admin covers support/finance/super for V1).

## Implemented (2026-06, iteration 1 — all tests 30/30 backend + frontend flows passed)
- Discovery: search + filters (area/type/amenity), 6 seeded Accra turfs, ratings.
- Turf profile: bento gallery, amenities, rules, reviews, sticky booking widget with live availability, slot picker, duration/package selector, live quote.
- Guest + account checkout: create → contact/coupon → mock pay → instant confirmation + email receipt. Slot-overlap rejected (409).
- Guest lookup & cancel (reference + contact), authenticated My Bookings (cancel with live full-refund countdown, reschedule request, post-session review).
- Owner dashboard: overview KPIs, turf CRUD, bookings, reschedule approve/reject, owner cancel (strike engine), payouts (held/released/net).
- Admin console: stats/GMV, bookings (refund, payout hold), owner moderation (suspend/reset strikes), disputes (raise/resolve), coupons (create/toggle), audit logs.
- Cancel/reschedule authorization hardened (owning token or matching contact).

## Backlog / remaining
## Implemented (2026-06, iteration 2 — 43/43 backend tests + all frontend flows passed)
- **Live payments (Paystack), keys-ready**: `/api/payments/config`, `/bookings/{id}/checkout` (card + mobile money), `/payments/verify/{ref}`, signature-verified `/payments/webhook`. MOCK mode until PAYSTACK keys set in backend/.env.
- **SMS alerts (Twilio-ready)**: `send_sms` sends confirmations + reminders; logs when TWILIO_* absent. Reminder cron `/api/cron/send-reminders` (WEBHOOK_CRON_SECRET auth), every 30 min via `.emergent/crons.yml`.
- **Owner Ghana Card verification**: card + selfie uploads to object storage, admin review/approve; unverified owners blocked from publishing (`POST /owner/turfs` → 403). Admin Verifications tab with image previews.
- **Map discovery**: Leaflet + OpenStreetMap list/map toggle on Home (free, no key).
- **Separate branded portals**: customers `/`+`/auth`, owners `/owner/login`+`/owner`, admin `/admin/login`+`/admin`.

## Integration keys (backend/.env — empty = mock/log): PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM. Set to go live.

## Older backlog / remaining
- P0: Real Paystack integration (payments + payout/mobile-money verification); background payout scheduler job (currently computed lazily on read).
- P1: SMS alerts (Twilio); owner identity verification (Ghana Card + liveness); email OTP / Google sign-in; brute-force lockout on login; dispute evidence upload (object storage).
- P2: Analytics charts, reconciliation export, coupon targeting UI, phone-number normalization, split server.py into modules, migrate to FastAPI lifespan handlers, events workflow (V2), multi-city.

## Test accounts

Create test accounts only through local or CI environment variables. Never record account credentials in repository files, tickets, screenshots, or chat.
