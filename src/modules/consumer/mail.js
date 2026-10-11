const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { AppError } = require('../../utils/errors');
const unavailable = () => new AppError(503, 'MAIL_UNAVAILABLE', 'Email delivery is temporarily unavailable. Please try again.');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function message({ email, otp, type }, from) {
  const reset = type === 'forget-password';
  const subject = reset ? 'Reset your Homes password' : 'Verify your Homes email';
  const instruction = reset ? 'Enter this code in Homes to reset your password.' : 'Enter this code in Homes to verify your email address.';
  return { from, to: email, subject,
    text: `Homes\n\n${instruction}\n\n${otp}\n\nThis code expires in 10 minutes. Never share it. If you did not request this, ignore this message.`,
    html: `<!doctype html><html><body style="margin:0;background:#f6f4ed;color:#172d25;font-family:Arial,sans-serif"><main style="max-width:480px;margin:32px auto;padding:32px;background:#fff;border-radius:16px"><p style="letter-spacing:3px;font-weight:700">HOMES</p><h1 style="font-size:24px">${subject}</h1><p>${instruction}</p><p style="font-size:32px;letter-spacing:8px;font-weight:700">${escape(otp)}</p><p>This code expires in <strong>10 minutes</strong>. Never share it.</p><p style="color:#666">If you did not request this, ignore this message.</p></main></body></html>` };
}
// Dependency injection keeps CI isolated: no real provider credentials or deliveries.
function createMailer(values = process.env, { fetchImpl = global.fetch, transportFactory = options => require('nodemailer').createTransport(options), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  return async input => {
    if (values.CONSUMER_MAIL_DRIVER === 'local' && ['test', 'development'].includes(values.NODE_ENV || 'development')) {
      const folder = values.CONSUMER_MAIL_LOCAL_PATH;
      if (!folder || !path.isAbsolute(folder)) throw new Error('Local account mail requires an absolute private directory');
      await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(folder, `${crypto.randomUUID()}.json`), JSON.stringify({ ...input, createdAt: new Date().toISOString() }), { mode: 0o600 });
      return;
    }
    const payload = message(input, values.CONSUMER_MAIL_FROM);
    const idempotencyKey = crypto.randomUUID();
    for (let attempt = 0; attempt < 3; attempt++) {
      let retry = false;
      try {
        if (values.CONSUMER_MAIL_DRIVER === 'resend' && values.RESEND_API_KEY && values.CONSUMER_MAIL_FROM) {
          let response;
          try { response = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${values.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ ...payload, to: [input.email] }), signal: AbortSignal.timeout(10000) }); }
          catch { retry = true; throw unavailable(); }
          // Never log/read provider error payloads: they can contain addresses or content.
          if (!response.ok) { retry = response.status === 429 || response.status >= 500; await response.body?.cancel(); throw unavailable(); }
          await response.body?.cancel();
          return;
        }
        if (values.CONSUMER_MAIL_DRIVER !== 'smtp' || !values.SMTP_HOST || !values.SMTP_USER || !values.SMTP_PASSWORD || !values.CONSUMER_MAIL_FROM) throw unavailable();
        const transport = transportFactory({ host: values.SMTP_HOST, port: Number(values.SMTP_PORT || 465), secure: values.SMTP_PORT !== '587', requireTLS: true, auth: { user: values.SMTP_USER, pass: values.SMTP_PASSWORD }, connectionTimeout: 10000, socketTimeout: 15000 });
        try { await transport.sendMail(payload); return; }
        catch (error) {
          // SMTP has no idempotency facility. Only retry failures before message submission.
          retry = error.command === 'CONN' && ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(error.code);
          throw unavailable();
        } finally { transport.close?.(); }
      } catch {
        if (!retry || attempt === 2) throw unavailable();
        await sleep(250 * 2 ** attempt);
      }
    }
  };
}
module.exports = { sendCode: input => createMailer()(input), createMailer, message };
