# Administration roles

- `super_admin`: full access and administrator provisioning.
- `admin`: properties, publishing, featuring, agents/agencies, verification, viewing requests, media, and audit history.
- `editor`: listing content and media only; cannot publish/archive, verify, feature, manage bookings, or manage administrators.

Create the first super administrator only with `npm run seed:admin`. Use a unique password of at least 12 characters and clear seed variables afterward. Access tokens are short-lived; refresh tokens are opaque, hashed at rest, rotated on use, and revocable.

Editors do not receive private booking or inquiry data. Password resets increment the access-token version and revoke refresh sessions; suspension revokes refresh sessions as well. Administrator JSON never includes password/token-version/reset fields. Refresh-token rotation consumes a token atomically so only one concurrent redemption can succeed.
