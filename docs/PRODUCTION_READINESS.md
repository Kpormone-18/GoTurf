# GoTurf production readiness plan

## Scope and release decision

This document is a technical and operational launch plan, not legal advice. A Ghana-qualified lawyer, accountant, insurance broker, payment provider, and security reviewer must approve the relevant sections before public launch.

**Current decision: do not launch public payments yet.** The app is suitable for internal demo and controlled staging after the items marked **Launch blocker** are complete.

> **NestJS branch notice:** `production-ready-nestjs` intentionally removes the legacy FastAPI source. It is a clean NestJS infrastructure branch, not a fully ported marketplace API yet. The API-parity milestones below must be completed before this branch can power the public React app.

## Current architecture and data flow

| Layer | Current implementation | Data handled |
| --- | --- | --- |
| Web client | React 19 / CRA / CRACO SPA | account state, booking inputs, customer contact details |
| API (current) | FastAPI | production compatibility service during the NestJS cutover only |
| API (target) | NestJS / TypeScript | contract-compatible booking, payment, owner, support, and verification API |
| Database | PostgreSQL via SQLAlchemy JSONB document store | users, turfs, bookings, messages, notifications, disputes |
| Payments | Paystack server-side transaction initialization, verification, signed webhook | transaction references, amount, status; never card details |
| Email | Resend API | transactional booking and cancellation messages |
| Cache, limits, jobs | Redis + BullMQ | shared rate limits, short-lived cache, durable notification jobs |
| SMS | Hubtel Ghana SMS | optional booking notifications; approved sender ID required |
| File storage | local disk in development; S3-compatible object storage optional | turf photos and Ghana Card verification files |

### Booking path

1. Customer selects a turf, date, duration, and package.
2. API calculates price from server-owned rates, checks operating hours and overlapping slots, then creates a pending booking.
3. Checkout collects contact data and asks server to create a Paystack transaction.
4. Customer completes payment on Paystack.
5. Paystack webhook and callback verification confirm a successful GHS transaction before booking confirmation.
6. Confirmation, owner notification, payout hold, cancellation, reschedule, dispute, review, and chat records use that booking.

### NestJS migration status and cutover rule

NestJS now has a separate `backend-nest/` service that compiles independently. It provides the production foundation: strict validation, exact-origin CORS, PostgreSQL and Redis health checks, Redis cache/rate-limit primitives, BullMQ notification retry jobs, and a Hubtel SMS adapter. The live FastAPI service has also been switched from Twilio variables to Hubtel variables so the existing product does not remain tied to Twilio during the transition.

**Do not point the React client at NestJS yet.** The React client has 52 established `/api` endpoints, including payment, owner, chat, admin, upload, and cron routes. A framework rewrite does not justify a breaking booking or payment migration. Keep the existing API online until every route has contract tests covering response shape, authorization, validation errors, status codes, payment idempotency, and side effects. Then run NestJS in staging against a copied, anonymized database; mirror safe read traffic; compare results; cut over with a rollback switch; and only then retire FastAPI.

NestJS does not “link” to React in a special way: both use JSON over HTTP. Its material value here is one TypeScript ecosystem for DTOs, validation, tests, and tooling. Do not share server-only implementation code or secrets with the React bundle.

#### Required migration milestones

1. Freeze and version the current `/api` contract. Add an automated route inventory and request/response fixtures for all 52 routes.
2. Design a relational PostgreSQL schema and migrations for users, turfs, availability, bookings, payments, messages, notifications, verification, disputes, and audit events. Do not port the current full-collection JSONB scan pattern.
3. Port in risk order: public turf reads; auth; availability/quoting; booking reservation; Paystack checkout/webhook; messages; owner operations; files; admin and cron operations.
4. Make every money-changing endpoint idempotent and transactional. Reserve slots with database constraints/locks before payment initialization.
5. Run dual-read comparisons in staging and a controlled pilot. Use a feature flag or load-balancer route switch to roll back without database data loss.
6. Cut production traffic to NestJS only after payment/webhook reconciliation, security review, load testing, restore testing, and mobile E2E tests pass. Then disable and archive FastAPI; do not leave two writers active.

### Redis implementation boundaries

- Redis is for ephemeral cache, distributed rate limits, queue state, idempotency locks, and short-lived session/refresh-token metadata—not the source of truth for bookings or payments.
- PostgreSQL remains the authoritative ledger. A Redis outage must fail closed for write paths that depend on idempotency/rate limiting and must surface through `/api/healthz` and monitoring.
- Use TLS, a password/ACL, private networking, persistence suitable for queue recovery, key prefixes, TTLs, and separate production/staging instances.
- BullMQ persists queued jobs in Redis and retries them; workers must make email/SMS sends idempotent and retain delivery outcomes in PostgreSQL. Nest’s BullMQ integration uses Redis-backed queues and supports retryable workers: [NestJS queues](https://docs.nestjs.com/application/queues).

### SMS provider decision: Hubtel Ghana

Hubtel replaces Twilio as the default SMS adapter because it is Ghana-focused and offers programmable SMS alongside Ghana-market services. This is a local-fit decision, **not a claim that it is always cheaper**—obtain a current Ghana destination quote, sender-ID approval, delivery-rate evidence, support SLA, and data-processing terms before signing. Hubtel’s developer documentation describes Client ID/Client Secret credentials and an SMS API; keep those values server-side only: [Hubtel API documentation](https://docs-developers.hubtel.com/).

Use `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_SENDER_ID`, and optionally `HUBTEL_SMS_URL`. Keep the provider adapter isolated so a provider can be changed without changing booking code. Never put Hubtel credentials in React, query strings, screenshots, support tickets, or logs.

### Trust boundaries

- Browser input, URLs, upload files, Maps links, messages, image URLs, payment callback references, Paystack webhooks, cron calls, and third-party API responses are untrusted.
- API owns price calculations, role checks, payment confirmation, booking state changes, and payout eligibility.
- Production secrets must exist only in managed server-side secret storage. Never expose secrets in React variables, source files, browser storage, screenshots, logs, or support chats.

## Audit fixes completed

| Finding | Fix | Benefit |
| --- | --- | --- |
| Mobile Safari `ResizeObserver` loop could open CRA error overlay during page changes. | Resize observer delivery is deferred to next animation frame. | Prevents benign layout notifications from breaking mobile booking and confirmation flows. |
| Owner dashboard regression test failed after full-page turf editor URL state was added. | Added missing `useSearchParams` test mock. | Dashboard regression now remains testable. |
| Mock payment endpoint could confirm a booking even when Paystack was configured. | Disabled mock confirmation whenever Paystack is enabled. | Blocks free booking confirmation in live payment mode. |
| Payment verification accepted success status without confirming value. | Verification and webhook now require exact GHS currency and server-calculated amount. | Prevents fulfillment after wrong-currency or wrong-amount payments. |
| Login/register had no application-level abuse guard. | Added 10 attempts per IP per 15-minute local limit and `Retry-After`. | Reduces basic credential stuffing in one-process deployments. Replace with shared edge/Redis limit before scale-out. |
| No database-aware health endpoint. | Added `/api/healthz`, which executes `SELECT 1`. | Deploy platform can remove unhealthy instances instead of serving failures. |
| FastAPI/Twilio stack was a scaling and provider-fit constraint. | Added a compiling NestJS migration service with Redis/BullMQ and replaced active FastAPI Twilio calls with Hubtel. | Enables a staged TypeScript migration, shared distributed infrastructure, local SMS provider evaluation, and retryable notifications without breaking today’s frontend contract. |

## Verified checks

- `npm run build`: passes.
- Frontend tests: pass after dashboard mock repair.
- Backend image validation tests: 3 pass.
- Python source compilation: passes.
- Full backend `pytest` suite did not run because `pytest` is not installed in this environment. Add it to development requirements and CI; do not treat this as a passing backend suite.
- Dependency audit could not run with `npm audit` because this repository uses Yarn and has no `package-lock.json`. Run `yarn audit` in CI with registry access, pin results, and remediate high/critical findings.

## Launch blockers

### Security and identity

- **Launch blocker:** Move every production rate limit to Redis and/or the edge. The NestJS foundation includes a Redis primitive, but it must be applied and tested on login, registration, guest lookup, booking creation, checkout, messaging, uploads, webhooks, and provider callbacks. Add CAPTCHA or Turnstile on repeated failures.
- **Launch blocker:** Replace public booking-ID reads with an opaque, expiring checkout capability token for guest checkout and confirmation. UUID secrecy is not authorization; booking responses contain customer data.
- **Launch blocker:** Use short-lived access tokens, secure refresh-token cookies, revocation/rotation, password-reset flow, email verification, and MFA for owners/admins.
- **Launch blocker:** Add password policy, breached-password screening, account lockout telemetry, admin audit trail, and forced session logout after password changes.
- **Launch blocker:** Add security headers: CSP, HSTS after HTTPS is stable, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and frame protection. Set them at reverse proxy/CDN and test payment redirects.
- **Launch blocker:** Configure production CORS to exact HTTPS web origins only. Never use `*`, localhost, or broad preview origins in production.
- **Launch blocker:** Store Ghana Card images only in private storage, encrypt at rest, use short-lived signed URLs, record every access, restrict admin roles, define deletion schedule, and prohibit local-disk storage.
- **Launch blocker:** Add malware scanning and image re-encoding for uploads. Validate content, extension, size, dimensions, and storage path. Do not trust client MIME type.
- **Launch blocker:** Independent penetration test covering IDOR, payment tampering, CSRF, XSS, upload abuse, auth bypass, webhook replay, rate-limit bypass, and owner/admin authorization.

### Payments, money, and marketplace operations

- Use Paystack **live** secret/public keys only in production secret management. Keep test and live projects separate. Never commit or send secret keys.
- Configure an HTTPS webhook URL such as `https://api.example.com/api/payments/webhook`; verify HMAC signatures, event idempotency, reference, status, GHS currency, and expected amount. Paystack recommends server-side initialization and verification, and amount verification before delivery: [Accept Payments](https://paystack.com/docs/payments/accept-payments/), [Verify Payments](https://paystack.com/docs/payments/verify-payments/), [Webhooks](https://paystack.com/docs/payments/webhooks/).
- Add an immutable payment ledger with provider event ID, raw-event retention policy, amount, currency, booking ID, reconciliation state, refund state, and staff actor. Enforce unique payment references and idempotency keys.
- Reconcile Paystack settlements, refunds, chargebacks, owner payouts, platform fees, and dispute holds daily. A human must approve exceptional payouts.
- Decide merchant-of-record model, escrow wording, platform commission, taxes/VAT, refunds, owner penalties, chargeback ownership, payout timing, reserve policy, and insolvency/failed-provider process with counsel and finance adviser.
- Remove mock checkout from public production environment or ensure it cannot be selected by any production configuration.

### Data, privacy, and legal

- Register or confirm registration obligations with Ghana's Data Protection Commission before processing customer, owner, chat, payment, and identity-verification data. Review the [Data Protection Act, 2012 (Act 843)](https://dataprotection.org.gh/wp-content/uploads/2025/05/Data-Protection-Act-2012-Act-843.pdf) and the Commission's [compliance guidelines](https://dataprotection.org.gh/wp-content/uploads/2025/07/GUIDELINES-TO-DEMONSTRATE-DATA-PROTECTION-COMPLIANCE-1.pdf) with Ghana counsel.
- Publish lawyer-reviewed Privacy Notice, Terms of Use, Customer Booking Terms, Owner Marketplace Agreement, Cancellation/Refund Policy, Cookie Notice/consent process, Community/Chat Rules, and Complaint/Dispute Policy. Replace current placeholder links before launch.
- Policies must identify controller/contact details, lawful bases, purpose, data categories, recipients/processors, international transfers, retention periods, data-subject rights, complaint route, cookies, payment processor, and verification-document handling.
- Obtain explicit, recorded acceptance for Terms/Privacy at registration and booking. Version policies; store policy version, timestamp, user ID/IP, and acceptance evidence.
- Define a data-retention schedule: pending bookings, confirmed bookings/financial records, messages, verification documents, images, support tickets, logs, backups, and inactive accounts. Add deletion/anonymization jobs and lawful-hold process.
- Execute data-processing agreements with hosting, database, storage, Resend, Twilio, Paystack, analytics, error monitoring, and support vendors. Verify their cross-border transfer and breach-notification terms.
- Register business, tax, VAT, payment, consumer-protection, marketplace, insurance, and local operating requirements with qualified Ghana professionals. Confirm whether facilities need public-liability insurance and whether platform needs cyber, professional, or crime cover.

### Reliability, data model, and operations

- **Launch blocker:** Replace FastAPI's full-collection JSONB scans in `backend/storage/postgres.py` with indexed relational tables as part of NestJS migration. Current collection emulation loads whole collections, which becomes slow and costly as bookings/users grow.
- **Launch blocker:** Add a TypeScript migration tool (Prisma, TypeORM migrations, or a reviewed SQL migration runner), schema versioning, uniqueness constraints, foreign keys where appropriate, transactional slot reservation, and indexes for booking turf/date/status, user email, reference, payment reference, owner ID, and notifications.
- **Launch blocker:** Make concurrent booking reservation atomic. Current read-then-write overlap check can race under simultaneous requests. Use row/advisory locks or a dedicated slot inventory table with unique constraints.
- **Launch blocker:** Deploy managed PostgreSQL with backups, point-in-time recovery, encrypted connections, least-privilege database user, restore test, and retention policy.
- Add job queue/worker for email, SMS, reminders, payout release, cleanup, and webhook retries. Do not perform long third-party actions only in request paths.
- Add structured logs without passwords, tokens, Ghana Card numbers, full payment information, or message text. Add Sentry/equivalent client and server error reporting, uptime monitor, metrics, alerts, and runbooks.
- Define SLOs: API availability, booking creation success, payment verification time, webhook lag, message delivery, restore time, and data-loss tolerance. Test rollback and incident response.

### Web/mobile quality

- Test critical flows at 320, 375, 390, 414, 768, 1024, and 1440px; iOS Safari and Android Chrome; slow 3G/4G; keyboard open; reduced motion; orientation change; guest/customer/owner/admin roles.
- Add Playwright/Cypress end-to-end tests for discover, booking, payment callback, cancellation, reschedule, owner listing, owner hours/24-hour carryover, chat authorization, verification, and payout hold.
- Add axe accessibility checks, keyboard-only flows, focus order, screen-reader labels, color contrast, error-summary linkage, and WCAG 2.1 AA review.
- Convert legal placeholder pages to approved content. Test all external links, Maps links, support email, phone, and social links.
- Optimize image delivery through CDN, responsive sizes, WebP/AVIF, cache headers, and performance budgets. Measure Core Web Vitals on real mobile devices.

## Required keys, accounts, and setup

| Service | Required values | How to obtain/use |
| --- | --- | --- |
| Domain/DNS | apex and `www`; API subdomain | Buy domain from registrar, host DNS in Cloudflare/registrar, create HTTPS records, use separate staging subdomain. |
| TLS/CDN/WAF | Cloudflare or equivalent | Enable managed TLS, DDoS protection, WAF, bot/rate rules, cache static content, and DNSSEC if supported. |
| Database | `DATABASE_URL` | Create managed PostgreSQL; use private network/TLS; use standard `postgresql://` format for NestJS; place URL in server secret store. |
| Redis | `REDIS_URL` | Create a managed Redis instance with TLS/ACL and private networking; separate staging/production; configure queue retention and outage alerts. |
| JWT | `JWT_SECRET` | Generate at least 32 random bytes with a password manager/secret manager; rotate with planned invalidation process. |
| Admin bootstrap | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Create only through secure deployment secret store; force password change and MFA at first sign-in. |
| Paystack | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | Create Paystack business account, complete KYC, enable desired Ghana channels, configure live webhook/callback URLs, use server secret only. |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` | Create account, verify sending domain, publish SPF/DKIM/DMARC, use a role mailbox such as `bookings@domain`. |
| Hubtel SMS | `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_SENDER_ID`, optional `HUBTEL_SMS_URL` | Create a Hubtel developer account, create credentials, obtain sender-ID approval, verify Ghana delivery/compliance/cost, and keep credentials in server secret storage. |
| Object storage | `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT_URL` | Create private bucket/R2 bucket, server-only least-privilege credentials, lifecycle deletion, encryption, access logs. |
| Scheduled jobs | `WEBHOOK_CRON_SECRET` | Generate distinct random secret; call only from authenticated scheduler or replace endpoint protection with scheduler identity/OIDC. |
| Monitoring | Sentry DSN, uptime provider, logs/metrics provider | Separate production project, redaction rules, alert recipients, incident runbook, monthly test alert. |

Maintain `.env.example` only with empty placeholders. Use a managed secret store (hosting provider, Doppler, 1Password Secrets Automation, AWS/GCP/Azure secret service). Restrict production secret access, rotate after staff departure, and scan commits/CI logs for leaks.

## Suggested V1 monthly budget (USD, excluding taxes and provider transaction fees)

These are planning ranges, not provider quotes. Confirm Ghana pricing, tax, exchange rate, transaction fees, SMS rates, and usage limits before signing.

| Item | Lean launch | Growing launch | Notes |
| --- | ---: | ---: | --- |
| Domain, DNS, TLS/CDN | $2–25 | $25–100 | domain annual cost averaged monthly; WAF may add cost |
| Frontend/API hosting | $20–80 | $100–350 | at least two environments; no single hobby instance for payments |
| Managed PostgreSQL/backups | $25–100 | $150–600 | include PITR and storage growth |
| Managed Redis/queue | $10–50 | $75–300 | include TLS, persistence, and queue retention |
| Object storage/CDN | $5–30 | $50–250 | verification document retention raises cost |
| Transactional email | $0–25 | $25–150 | volume and dedicated IP vary |
| SMS (Hubtel or approved Ghana provider) | $10–100 | $100–800 | Ghana destination pricing varies materially; obtain a written quote before launch |
| Error monitoring/logs/uptime | $0–50 | $75–350 | pay for alerting before public launch |
| Security/WAF/penetration test | $1,500–8,000 one-time | $5,000–20,000 yearly | local counsel and security scope drive this |
| Legal, policy, tax, agreements | $1,500–10,000 one-time | $5,000–25,000 yearly | do not skip for payments/marketplace/PII |
| Insurance and accounting | $500–5,000 yearly | $3,000–15,000 yearly | get Ghana-specific quotes |

Practical operating baseline: **$100–400/month** before SMS, payment fees, legal, security testing, insurance, and staff. Budget a separate **$4,000–20,000+ launch-readiness fund** for legal, security, and compliance work. Payment-provider fees are variable and must be modeled separately per transaction.

## Release sequence

1. Create staging domain, isolated database and Redis, test Paystack keys, test Hubtel sender ID/SMS, and non-production owners/customers.
2. Complete the NestJS route-contract inventory and port/read-compare plan; do not cut traffic while any payment or booking route lacks parity proof.
3. Close every Launch blocker, add CI, run dependency audit, complete external security review, and fix findings.
4. Write/approve policies and agreements; configure acceptance records; complete provider KYC and Ghana compliance review.
5. Configure production secrets, private storage, backup/PITR, Redis persistence, monitoring, WAF, exact CORS, health checks, and documented rollback.
6. Run realistic booking, payment, webhook, refund, dispute, owner cancellation, account deletion, restore, NestJS rollback, and incident drills in staging.
7. Launch with live payments disabled or limited to internal staff first. Enable small owner/customer pilot after 24–72 hours clean monitoring.
8. Use staged rollout. Stop/roll back for payment mismatch, PII exposure, security alert, booking double-allocation, Redis/queue failure, or elevated error rate.

## Public-launch evidence folder

Keep dated evidence of: security test report, dependency audit, change approvals, privacy/terms versions, DPC/counsel assessment, provider KYC, payment webhook test, backup restore test, access review, DPIA/risk assessment, incident plan, insurance certificates, tax/accounting advice, owner agreement acceptance, and customer policy acceptance.
