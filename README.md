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
