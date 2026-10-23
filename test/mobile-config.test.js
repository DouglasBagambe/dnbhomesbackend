const test = require('node:test');
const assert = require('node:assert/strict');
const { mobileConfig } = require('../src/modules/consumer/mobile-config');
test('mobile config exposes only valid public values and respects provider activation', () => {
  const values = {
    GOOGLE_OAUTH_WEB_CLIENT_ID: '123456789-real.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'NEVER-EXPOSE', APPLE_OAUTH_CLIENT_ID: 'com.homes.signin',
    APPLE_OAUTH_CLIENT_SECRET: 'NEVER-EXPOSE', PUBLIC_SUPPORT_EMAIL: 'help@homes.co.ug',
    PUBLIC_SUPPORT_PHONE: '+256700123456', PUBLIC_SUPPORT_WHATSAPP: '+256700123456',
  };
  const config = mobileConfig(values, { google:true, apple:true });
  assert.equal(config.googleWebClientId, values.GOOGLE_OAUTH_WEB_CLIENT_ID);
  assert.equal(config.appleServiceId, values.APPLE_OAUTH_CLIENT_ID);
  assert.equal(config.supportEmail, 'help@homes.co.ug');
  assert.equal(config.supportPhone, '+256700123456');
  assert.doesNotMatch(JSON.stringify(config), /NEVER-EXPOSE/);
  assert.equal(mobileConfig(values, {}).googleWebClientId, '');
  assert.equal(mobileConfig(values, {}).appleServiceId, '');
});
test('mobile config rejects malformed links, preview IDs and contact injection', () => {
  const config = mobileConfig({ GOOGLE_OAUTH_WEB_CLIENT_ID:'123-previewhomes.apps.googleusercontent.com',
    APPLE_OAUTH_CLIENT_ID:'com.homes.preview.web', PUBLIC_SUPPORT_EMAIL:'help@homes.co.ug?body=injected',
    PUBLIC_SUPPORT_PHONE:'javascript:bad', PUBLIC_SUPPORT_WHATSAPP:'+256700123456?text=bad'}, { google:true,apple:true });
  assert.deepEqual(config, { googleWebClientId:'',appleServiceId:'',supportEmail:'',supportPhone:'',supportWhatsapp:'' });
});
