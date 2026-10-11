const test = require('node:test');
const assert = require('node:assert/strict');
const { createMailer, message } = require('../src/modules/consumer/mail');
const input = { email: 'recipient@homes-fixture.co.ug', otp: '123456', type: 'forget-password' };
const values = { NODE_ENV: 'production', CONSUMER_MAIL_DRIVER: 'resend', RESEND_API_KEY: 'isolated-adapter-fixture', CONSUMER_MAIL_FROM: 'accounts@homes-fixture.co.ug' };
test('Homes email has branded HTML, escaped code, text fallback and expiry', () => {
  const mail = message({ ...input, otp: '<123>&' }, values.CONSUMER_MAIL_FROM);
  assert.match(mail.html, /HOMES/); assert.match(mail.html, /&lt;123&gt;&amp;/); assert.match(mail.text, /10 minutes/); assert.match(mail.subject, /Reset/);
  assert.match(message({ ...input, type: 'email-verification' }).subject, /Verify/);
});
test('Resend retry is bounded and idempotent; secrets and errors are not surfaced', async () => {
  const calls = [];
  const send = createMailer(values, { sleep: async () => {}, fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: calls.length === 3, status: 503 }; } });
  await send(input); assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map(call => call.options.headers['Idempotency-Key'])).size, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  const permanent = createMailer(values, { fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(permanent(input), error => error.code === 'MAIL_UNAVAILABLE' && !error.message.includes('123456'));
});
test('SMTP retries only connection failures, uses authenticated TLS and closes transport', async () => {
  let attempts = 0, closed = 0;
  const smtp = { ...values, CONSUMER_MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.homes-fixture.co.ug', SMTP_USER: 'fixture', SMTP_PASSWORD: 'fixture', SMTP_PORT: '587' };
  await createMailer(smtp, { sleep: async () => {}, transportFactory: options => { assert.equal(options.requireTLS, true); assert.equal(options.secure, false); return { sendMail: async mail => { assert.ok(mail.html); if (++attempts < 2) throw { command: 'CONN', code: 'ECONNECTION' }; }, close: () => closed++ }; } })(input);
  assert.equal(attempts, 2); assert.equal(closed, 2);
  let ambiguous = 0;
  await assert.rejects(createMailer(smtp, { transportFactory: () => ({ sendMail: async () => { ambiguous++; throw { command: 'DATA', code: 'ETIMEDOUT' }; } }) })(input));
  assert.equal(ambiguous, 1);
});
test('hosted local email driver fails closed', async () => {
  await assert.rejects(createMailer({ NODE_ENV: 'staging', CONSUMER_MAIL_DRIVER: 'local' })(input), /temporarily unavailable/);
});
