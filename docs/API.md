# API V1

Responses use `{ data }`; collections add `{ pagination: { page, limit, total, pages } }`. Errors use `{ error: { code, message, details? } }`.

## Public

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/properties` supports `q`, `purpose`, `type`, `country`, `region`, `district`, `area`, `minPrice`, `maxPrice`, `bedrooms`, `bathrooms`, `amenities`, `featured`, `verified`, `latitude`, `longitude`, `radius`, `page`, `limit`, and `sort` (`newest`, `oldest`, `price_asc`, `price_desc`, `popular`). Only published listings are returned.
- `GET /api/v1/properties/:idOrSlug`
- `POST /api/v1/bookings` creates a viewing request. Supply an `Idempotency-Key` header and guest name/email/phone when no user identity exists. A request is not a guaranteed appointment.

## Authentication

- `POST /api/v1/auth/admin/login`
- `POST /api/v1/auth/admin/refresh`
- `POST /api/v1/auth/admin/logout`
- `GET /api/v1/auth/admin/me`

Admin requests use `Authorization: Bearer <access-token>`.

## Protected admin

Under `/api/v1/admin`: dashboard; paginated property CRUD and publish/archive/feature actions; agents; agencies; bookings and status updates; media upload/delete; audit; and super-admin account management. Editors cannot publish/archive, verify, feature, manage bookings, or manage administrators.
