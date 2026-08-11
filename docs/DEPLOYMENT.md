# Deployment

Use separate development, test, staging, and production databases, buckets, origins, and secrets. Production must set `NODE_ENV=production`, strong independent JWT secrets, explicit `CORS_ORIGINS`, Atlas `MONGO_URI`, and `MEDIA_DRIVER=s3` with all `S3_*` values. Never use the local media adapter on ephemeral production storage.

Deploy `npm ci && npm test` before `npm start`. Health probes use `/api/v1/health`; readiness probes use `/api/v1/ready`. Termination signals stop HTTP acceptance, disconnect MongoDB, and exit. Back up MongoDB and object storage, centralize JSON logs, and alert on readiness, 5xx rate, latency, disk/bucket errors, and failed authentication spikes.
