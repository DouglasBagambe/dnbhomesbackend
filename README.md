# Homes API

Production-oriented Express and MongoDB API for the dnb Homes platform. Public discovery is guest-friendly; administration and booking PII are protected.

## Local setup

1. Install Node.js 22 (CI uses 22.23.3) and MongoDB.
2. Run `npm ci` using the committed lockfile.
3. Copy `.env.example` to `.env` and replace the secrets.
4. Run `npm run seed:admin` with the three `SEED_ADMIN_*` variables set.
5. Start with `npm run dev`.

For a populated development marketplace, run `npm run seed:demo` before starting the API. This idempotently upserts 50 illustrative properties, three agents, and one agency tagged `demo:homes-v1` and requires `NODE_ENV=development` and a loopback `homes_development` database. Re-running it updates the same records instead of duplicating them. Committed local demo photography keeps development independent of external image hosts. Remove that demo inventory and viewing requests attached to it with `npm run seed:demo:remove`; cleanup also refuses production.

The API is namespaced at `/api/v1`. Public contact and listing-interest submissions persist as private inquiries for authenticated admin follow-up. Run `npm run check` and `npm test` for verification. See `docs/` for contracts, deployment, roles, and migrations.

## Consumer identity and local account QA

Consumer accounts use Better Auth 1.7.7 with the existing MongoDB connection. Separate consumer identity, credential, session, verification and state collections keep Admin authorization independent. Passwords use the library's maintained hashing; email ownership uses hashed, single-use, ten-minute six-digit codes. Sessions expire after seven days, support logout/revocation, and reset revokes existing sessions. Raw unsigned session IDs are rejected. Consumer APIs require explicit signed bearer sessions; browser tokens stay in the Website BFF's HttpOnly cookie and Flutter tokens in platform secure storage.

Set `CONSUMER_ACCOUNTS_ENABLED=true` only with independent strong `CONSUMER_AUTH_SECRET` and `CONSUMER_WEB_PROXY_SECRET`, the public backend origin in `CONSUMER_AUTH_URL`, verified SMTP sender and authenticated TLS delivery. Match the proxy secret with the Website's server-only variable. Vercel's overwritten client IP is forwarded with a fresh method/path-bound HMAC; unsigned headers never affect the rate-limit bucket. Hosted accounts require MongoDB transactions and refuse local email delivery. A Gmail recipient address alone does not configure delivery. Never put SMTP credentials or these secrets in client configuration.

`GET /api/v1/consumer/me`, `/state` and `/viewings?page=1` return only the authenticated consumer's profile/state/history. `/state` takes atomic add/remove operations for Saved (200), Compare (2) or recent views (30). `/merge` preserves existing selection order and adds validated published guest selections; guest viewing claims require the original opaque status token and cannot transfer another account's record. Admin remains the only listing authority. Account deletion removes profile/session/state and anonymizes retained operational viewing contacts; it does not erase unrelated records.

Run `MONGOMS_DISTRO=ubuntu-22.04 node scripts/local-consumer-qa.js` for an ephemeral loopback-only account/media test API. It cannot connect to a hosted database and reuses QA ID `6aca1225ca3d4ce6f2209da4` only in the disposable local database. Captured verification mail lives in a private temporary folder, never uploads/logs. Stop the process to discard the test database. Website full-stack QA: `npx playwright test --config playwright.accounts.config.ts` from the sibling Website repository after its local production build. The documented test Gmail address receives only locally captured messages until a delivery provider exists.

The development watcher uses Node's built-in `--watch`; this removes the vulnerable optional nodemon watcher dependency without changing the runtime server. Node 22 is the local/CI baseline.

## Production email and durable media

Consumer accounts are optional (`CONSUMER_ACCOUNTS_ENABLED=false` until configuration is complete). Enabling them on staging/production requires independent random `CONSUMER_AUTH_SECRET` and `CONSUMER_WEB_PROXY_SECRET` (at least 32 characters, different from both Admin JWT secrets), `CONSUMER_AUTH_URL` (public API origin), explicit `CORS_ORIGINS`, and MongoDB transactions. Generate secrets privately with `openssl rand -hex 32`; never paste them into logs or Git. The Website BFF shares only the proxy secret server-side. Auth uses hashed, single-use 6-digit verification/reset codes expiring after ten minutes, seven-day revocable sessions and persistent rate limits. Reset revokes sessions; deletion removes account/state and anonymizes associated operational viewings.

Choose `CONSUMER_MAIL_DRIVER=resend`, `RESEND_API_KEY`, and a verified email address in `CONSUMER_MAIL_FROM`; or choose `smtp` and provide `SMTP_HOST`, `SMTP_PORT=465` or `587`, `SMTP_USER`, `SMTP_PASSWORD`, and `CONSUMER_MAIL_FROM`. Both send Homes HTML plus plain text. Resend requests have a per-message idempotency key, 10-second timeout and up to three attempts on transport/429/5xx failures. SMTP uses authenticated mandatory TLS and retries only connection failures before submission. Ambiguous SMTP delivery is not retried. Permanent failures produce sanitized errors; codes/provider payloads are never logged. The `local` capture driver is test/development only. No live delivery is claimed until the provider verifies the sender; switching providers or supplying credentials needs configuration only.

Production **requires** `MEDIA_DRIVER=s3`: `S3_ENDPOINT`, `S3_REGION` (`auto` for R2), `S3_BUCKET`, bucket-scoped `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and stable public HTTPS `S3_PUBLIC_URL`. Use a Cloudflare R2 S3 API endpoint and a read-only public custom domain for production; R2's rate-limited `r2.dev` URL is for preview testing. Credentials stay server-side. The public domain must serve correct Content-Type and allow browser playback; add that origin to Website `NEXT_PUBLIC_MEDIA_ORIGINS`. Do not change the bucket/public origin without a media migration. No silent production filesystem fallback exists.

Uploads keep the existing ten-file/100-MB batch, 10-MB image and 50-MB video limits. MIME claims are checked against container signatures. Object names are UUIDs under bounded image/video/date prefixes, independent of client filenames. S3 uses bounded retries/timeouts and immutable cache headers; upload metadata stores provider/bucket provenance. Failed metadata creation compensates by deleting its object. A library asset still referenced by any property media or cover cannot be deleted (409): first save the property without it, then delete the detached library asset. Detaching media alone deliberately keeps the library asset reusable; it does not delete an object that another property may share. Failed storage operations never mark metadata deleted. Integration tests exercise the real SDK against an isolated local S3-compatible HTTP server, with no cloud credentials.

Readiness: `/api/v1/health` checks process availability; `/api/v1/ready` returns 503 when the database is disconnected. Monitor both and provider availability externally. Neither endpoint exposes credentials. Production upload/email outages return clean retryable errors; production startup validates configuration before connecting. The preview's existing synthetic QA record is not real inventory and must never be promoted into genuine production listings.
