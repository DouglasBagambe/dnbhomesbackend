const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Local messages live outside the public uploads directory and never enter logs.
async function sendCode({ email, otp, type }) {
  if (process.env.CONSUMER_MAIL_DRIVER === 'local' && ['test', 'development'].includes(process.env.NODE_ENV || 'development')) {
    const folder = process.env.CONSUMER_MAIL_LOCAL_PATH;
    if (!folder || !path.isAbsolute(folder)) throw new Error('Local account mail requires an absolute private directory');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(folder, `${crypto.randomUUID()}.json`), JSON.stringify({ email, otp, type, createdAt: new Date().toISOString() }), { mode: 0o600 });
    return;
  }
  if (process.env.CONSUMER_MAIL_DRIVER !== 'smtp' || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.CONSUMER_MAIL_FROM) throw new Error('Account email delivery is not configured');
  const transport = require('nodemailer').createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_PORT !== '587', requireTLS: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }, connectionTimeout: 10000, socketTimeout: 15000 });
  try { await transport.sendMail({ from: process.env.CONSUMER_MAIL_FROM, to: email, subject: type === 'forget-password' ? 'Reset your Homes password' : 'Your Homes verification code', text: `Your Homes code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this message.` }); } catch { throw new (require('../../utils/errors').AppError)(503,'MAIL_UNAVAILABLE','Email delivery is temporarily unavailable. Please try again.'); }
}
module.exports = { sendCode };
