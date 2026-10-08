# Deployment readiness

Use separate development, test, staging, and production databases, buckets, origins, and secrets. Install the committed lockfile with Node 22 (`npm ci`; CI pins 22.23.3). Run check/tests before deploying. No deployment is performed by these commands.

Use `.env.production.example` as the blank production input checklist; fill values only in an ignored `.env` or the host secret store. Its blank inputs intentionally fail startup. Do not reuse the development example.

Production startup validates **before connecting**:

- `NODE_ENV=production` and explicit `MONGO_URI` selecting a production database. Atlas SRV uses verified TLS by default; standard Mongo URLs require `tls=true` or `ssl=true`. Disabling certificate/hostname verification is rejected. Loopback, reserved hosts and demo/development/test database names are rejected. Douglas must supply the actual URI; never print it in logs.
- Independent strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (at least 32 characters, no development/placeholders).
- `CORS_ORIGINS`: nonempty comma-separated exact public HTTPS origins, including consumer website origins. Native clients and server-to-server Admin requests do not have an Origin header; CORS is not authentication.
- `TRUST_PROXY`: explicit verified proxy-hop count (`0` for direct service access). Only use a positive count when every route to the service traverses that many trusted proxies. Restrict direct ingress or clients can spoof forwarded IPs and evade rate limiting. The in-memory rate limits assume one API instance; coordinate a shared limiter before scaling to multiple instances. Admin proxies all browser requests; account for the shared Admin egress IP in ingress/rate-limit QA.
- `MEDIA_DRIVER=s3` and all of `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`. Endpoint/public URL must use public HTTPS. Supply the real S3/R2 account values; ensure bucket CORS and read permissions match the website. No production upload uses local filesystem storage. Provision narrowly scoped put/delete access and verify upload/read/delete against staging before launch.

Health probes use `/api/v1/health`; readiness uses `/api/v1/ready` and returns 503 when disconnected. Termination stops HTTP acceptance and disconnects MongoDB. Back up MongoDB and object storage, centralize JSON logs, and alert on readiness/5xx/latency and failed authentication. Logs redact tokens, cookies and URL query/params; production startup/request failures report error types instead of connection strings or arbitrary exception text. Production 5xx responses remove internal codes/details.

## Bootstrap and demo separation

Demo seed/cleanup require `NODE_ENV=development` and a loopback database named exactly `homes_development`. They refuse remote databases even if the caller accidentally leaves development mode enabled. Do not migrate/copy demo records or demo representatives into production; create genuine inventory through Admin and assign Douglas as the sole V1 representative.

The initial production administrator is a deliberate one-time operation: after confirming the database, set the three `SEED_ADMIN_*` variables and run `npm run seed:admin -- --confirm-production`. It refuses duplicate emails and requires a password of at least 12 characters. Clear seed credentials immediately afterward; do not keep them in the deployed service environment. Subsequent administrator provisioning belongs in the super-admin UI. Use separate local credentials for QA.

Review `docs/MIGRATION.md` before any legacy migration. Its default is a read-only dry run. Applied migrations require reviewed backups and staging verification, not an automatic launch step.
