# Homes API

Production-oriented Express and MongoDB API for the dnb Homes platform. Public discovery is guest-friendly; administration and booking PII are protected.

## Local setup

1. Install Node.js 20 and MongoDB.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and replace the secrets.
4. Run `npm run seed:admin` with the three `SEED_ADMIN_*` variables set.
5. Start with `npm run dev`.

The API is namespaced at `/api/v1`. Run `npm test` for isolated API tests. See `docs/` for contracts, deployment, roles, and migrations.
