// Public presentation/OAuth identifiers only. Never expose provider secrets.
function mobileConfig(values = process.env, providers = {}) {
  const text = name => String(values[name] || '').trim();
  const google = text('GOOGLE_OAUTH_WEB_CLIENT_ID');
  const apple = text('APPLE_OAUTH_CLIENT_ID');
  const email = text('PUBLIC_SUPPORT_EMAIL');
  const phone = key => /^\+[1-9][0-9]{6,14}$/.test(text(key)) ? text(key) : '';
  return {
    googleWebClientId: providers.google && /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(google) && !google.includes('previewhomes') ? google : '',
    appleServiceId: providers.apple && /^[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)+$/.test(apple) && !apple.includes('.preview.') ? apple : '',
    supportEmail: /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? email : '',
    supportPhone: phone('PUBLIC_SUPPORT_PHONE'),
    supportWhatsapp: phone('PUBLIC_SUPPORT_WHATSAPP'),
  };
}
module.exports = { mobileConfig };
