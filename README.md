# GoTurf

GoTurf is a marketplace for booking football pitches and event spaces in Accra, Ghana. Customers can discover venues, check availability, pay, and manage bookings; owners can publish and operate their turfs.

## Run locally

1. Create a PostgreSQL database, then copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a strong `JWT_SECRET`.
2. Install the backend with `pip install -r backend/requirements.txt`, then run `uvicorn server:app --reload` from `backend`.
3. Copy `frontend/.env.example` to `frontend/.env`, set `REACT_APP_BACKEND_URL=http://localhost:8000`, then run `yarn start` from `frontend`.

## Production integrations

| Service | Required for | Variables |
| --- | --- | --- |
| PostgreSQL | Core application data | `DATABASE_URL` |
| Paystack | Live card and mobile-money payments | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` |
| Resend | Transactional email | `RESEND_API_KEY`, `EMAIL_FROM` |
| Twilio | SMS confirmations and reminders | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| S3-compatible storage | Owner identity-document uploads | `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT_URL` |

Paystack, Resend, Twilio, and S3 storage are optional during local development. Paystack checkout remains in mock mode until its secret key is set; notifications and document uploads stay disabled until configured. Leaflet uses OpenStreetMap and needs no API key.
