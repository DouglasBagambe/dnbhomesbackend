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
