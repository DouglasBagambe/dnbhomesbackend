# Availability and the 14-day public visibility window

Publication and availability are independent. Publication remains draft / pending_review / published / archived. Administrators and super administrators manage a separate availabilityStatus: available / reserved / rented / sold / unavailable. Editors cannot change availability. Changes produce property.availability audit events.

Existing properties without an availability value preserve their behavior and do not receive invented availability badges. No backfill or destructive migration is needed. New properties created by an administrator through Admin start with an explicit Available selection.

On a real availability transition, the server stamps availabilityChangedAt. Rented and sold also get availabilityVisibleUntil exactly 14 × 24 hours later. Saving other property details or submitting the same availability value preserves that deadline. Choosing Available (or any nonterminal state) clears the deadline; a subsequent rented/sold transition starts a new window. These timestamps are server-owned: client payloads cannot override them.

While the window is open, published rented/sold properties remain in public listings and public details, with their status exposed for the existing mobile app to render. When the deadline is reached they disappear from public catalogue/search/geo queries and return 404 on public detail links. They remain in Admin inventory with the expiry visible and can be reopened. No scheduled job or database deletion is involved: public queries enforce the timestamp on each request. Client caches/open screens can retain earlier results until refreshed.

Reserved, rented, sold and unavailable properties reject new viewing requests with HTTP 409 PROPERTY_UNAVAILABLE. Expired or unpublished properties return 404. Existing viewing history and private tracking links remain intact. An idempotent replay of an existing request returns its original result rather than creating another request during the visibility window. Viewing requests remain pending requests, not inventory reservations; normal administrator confirmation is still required.

List and detail responses expose availabilityStatus, availabilityChangedAt and availabilityVisibleUntil when present. Admin's availability filter matches explicit statuses; legacy unset values remain visible in the unfiltered inventory. The mobile APK already supports the agreed availabilityStatus values and disabled viewing actions, so no further mobile code is needed for this policy.

Tests simulate expired timestamps in an isolated database to verify hiding without waiting 14 days. No live property or retained QA draft needs to be modified to validate expiry.
