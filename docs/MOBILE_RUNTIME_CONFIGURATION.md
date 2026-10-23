# Android version 1 runtime settings

`GET /api/v1/consumer/capabilities` now includes `data.mobile`. It contains only public presentation and OAuth client identifiers. Secrets, SMTP/Resend keys, Google client secrets and Apple private credentials must remain on the backend.

Configure the existing provider settings and enable the corresponding consumer provider only when ready. Android reads `GOOGLE_OAUTH_WEB_CLIENT_ID` and `APPLE_OAUTH_CLIENT_ID` from this endpoint after provider activation. Preview IDs are excluded. Android derives the Apple callback from its fixed HTTPS API origin and production package; the response cannot redirect the app to another host. iOS still has native URL-scheme/entitlement configuration and is outside this Android artifact.

Public support settings:

- `PUBLIC_SUPPORT_EMAIL`: real support mailbox.
- `PUBLIC_SUPPORT_PHONE`: international E.164 number, e.g. +256 followed by the actual subscriber number.
- `PUBLIC_SUPPORT_WHATSAPP`: international E.164 WhatsApp number.

Missing contacts use the existing website contact page. Missing provider identifiers leave those provider buttons unavailable; email accounts and guest browsing retain their existing behavior. Changes are fetched when the app starts or refreshes account capabilities. No mobile rebuild is required for these settings.

Google Cloud Android OAuth configuration must register `com.nilebitlabs.dnbhomes` and the **Play app signing certificate** once Play App Signing is established. The upload certificate used for direct APK installs is a different signing identity; add it too when testing direct installs. No provider credentials are fabricated by this release. Actual provider and email-delivery end-to-end checks still require owner setup.
