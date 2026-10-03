# GoTurf NestJS API migration

This service is the TypeScript replacement foundation for `../backend/server.py`.

It is intentionally **not** the active API yet. The React app has an established `/api` contract that includes booking, Paystack, chat, owner, admin, upload, and scheduled-job flows. Repointing React before route-by-route parity would create an avoidable booking and payment outage.

## What is implemented

- NestJS application bootstrap with strict request validation and explicit CORS origins.
- PostgreSQL and Redis `/api/healthz` checks.
- Redis helpers for cache and distributed rate limiting.
- Redis-backed BullMQ notification queue with retries and retention.
- Hubtel Ghana SMS adapter. Credentials remain server-side and notifications run in a worker, not a user request.

## Local setup

1. Copy `.env.example` to `.env` and set a standard PostgreSQL URL and Redis URL.
2. Start PostgreSQL and Redis locally.
3. Run `npm install`, then `npm run build`.
4. Run `npm run start:dev`; it listens on port 8001 by default.

## Cutover guardrails

1. Port and contract-test every current `/api` route.
2. Use a relational PostgreSQL schema with transactional slot reservations; do not carry forward the JSONB collection scans.
3. Verify Paystack signatures, exact GHS amount/currency, idempotency, and reconciliation against staging data.
4. Mirror safe reads and run a staged pilot behind a reversible route switch.
5. Point `REACT_APP_BACKEND_URL` to the NestJS URL only after parity and rollout gates pass.

Do not run FastAPI and NestJS as simultaneous writers for the same booking records.
