# Admin operations and media deployment

Permanent property deletion is restricted by the API to `super_admin`. The request requires both `confirmation` (the exact title or `DELETE`) and `confirmed: true`. The Admin adds two deliberate confirmation steps. No bulk delete exists.

Deletion hides the property first, preserves viewing requests with a title/slug/ID snapshot, and retains contacts, schedules, status, notes, agents, agencies, independent inquiries and existing audit events. It records `property.delete` with actor, title, dependencies and deletion journal ID. A resumable journal allows retries after partial failure. Only registered media assets matching the property's key or URL are considered for cleanup. Assets referenced by another property or profile are retained. Missing objects are tolerated; failed cleanup is reported and retryable by repeating the confirmed DELETE request. Journals and audit history are retained; deletion cannot restore a listing.

The `PropertyDeletion` and `AdminOperationLock` collections and optional property/booking fields are additive and created by Mongoose. No destructive migration is required. Existing viewing title snapshots are populated when a property is deleted. Database backups remain an operator responsibility.

## Durable media

Hosted staging and production uploads require S3-compatible durable storage. Local storage remains available for development/testing. `GET /api/v1/admin/media/health` reports safe configuration presence without exposing access keys. Ticket issuance and uploads fail closed when durable storage is not configured. Upload grants remain origin-bound, single-use and valid for 120 seconds. Existing exact-origin CORS, MIME/content checks, batching and size limits remain in place.

Render service: `srv-dbc6hpuq1p3s73cfdmjg` in Dyson workspace `tea-d6k1h94r85hc73bscps0`.

Set in Render, never source control:

- `MEDIA_DRIVER=s3`
- `S3_ENDPOINT=https://6250d7f6f39ff479a0e12cca01f3eb14.r2.cloudflarestorage.com`
- `S3_REGION=auto`
- `S3_BUCKET=dnbhomes-media`
- `S3_PUBLIC_URL=https://homes-media.nilebitlabs.com`
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`: bucket-scoped object read/write credentials entered through the provider configuration.

The bucket contains public property photos/videos only. Custom domain minimum TLS is 1.2. R2 development URL remains disabled. Uploads go browser → authenticated upload grant → backend → R2; browsers receive no S3 credentials. Backend storage logs contain safe error type/status only. Restarting the backend cannot remove R2 objects.

Changing storage configuration does not migrate old files. The observed genuine Ruti Mbarara listing references the old suspended backend; the same image path returns 404 on the current backend. Preserve the listing and recover the original image from a backup or owner before replacing it. Do not rewrite URLs without the corresponding object.

Before approving real inventory entry, verify a hosted JPG upload, returned public URL GET, property save/reload, and public URL GET after an actual backend restart. Record any DNS/direct-upload failure separately from storage failures. A successful ticket alone does not prove the browser reached the upload endpoint.

## Operational safeguards

Editors cannot publish/archive, verify, feature, bulk-operate, manage viewings/inquiries/admins, or permanently delete. Admins can manage ordinary operations; only super admins manage administrators. Role/status/password changes invalidate existing sessions. A database lease serializes administrator changes and protects the last active super admin. Deactivating agents/agencies preserves references; new assignments and publishing require active, consistent profiles.

Dashboard counts come from stored records and EAT viewing schedules. Audit filters use actor ID, exact action/entity and inclusive EAT dates. Notes are internal; audit metadata records that notes were submitted without copying their contents. Permanent bulk deletion, response automation and decorative analytics are intentionally absent.
