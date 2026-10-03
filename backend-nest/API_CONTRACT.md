# API parity inventory

The React client must retain these `/api` routes and response contracts during the NestJS migration. This file is an inventory, not proof of parity. Mark a route complete only after request, response, authorization, error, and side-effect contract tests pass.

| Area | Existing routes | NestJS state |
| --- | --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | Planned |
| Turf discovery | `GET /turfs`, `/turfs/neighborhoods`, `/turfs/:id`, `/turfs/:id/availability`, `/turfs/:id/quote`, `/turfs/:id/reviews` | Planned |
| Customer booking | `POST /bookings`, `GET /bookings/lookup`, `GET /bookings/:id`, `GET /me/bookings`, `POST /bookings/:id/contact`, `/cancel`, `/reschedule-request`, `/reviews`, `/messages` | Planned |
| Payments | `GET /payments/config`, `POST /bookings/:id/checkout`, `GET /payments/verify/:reference`, `POST /payments/webhook`, `POST /bookings/:id/pay` | Planned |
| Notifications | `GET /notifications`, `POST /notifications/:id/read` | Planned |
| Owner | `GET /owner/overview`, `/owner/payout-method`, `/owner/verification`, `/owner/turfs`, `/owner/bookings`; write endpoints under those resources | Planned |
| Files/media | `GET /files/:path`, `POST /owner/turfs/media`, `GET /media/:path` | Planned |
| Admin | `/admin/stats`, `/admin/bookings`, `/admin/owners`, `/admin/disputes`, `/admin/coupons`, `/admin/audit-logs`, `/admin/verifications` and listed mutations | Planned |
| Operations | `GET /healthz`, `POST /cron/send-reminders`, `POST /cron/morning-reminders` | Health implemented; other routes planned |

## Cutover test minimum

- Contract fixture tests for all public and authenticated responses.
- Role matrix tests: customer, owner, admin, guest, suspended owner, and anonymous user.
- Transaction tests for overlapping slots, 24-hour carryover, retries, duplicate Paystack webhooks, cancellation, refund, and payout holds.
- Staging comparison logs without contact, payment, message, or verification-document content.
- A single writable API at any moment. NestJS becomes the writer only after the migration switch; FastAPI then becomes read-only or is stopped.
