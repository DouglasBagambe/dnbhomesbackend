const crypto = require('node:crypto');
const net = require('node:net');
// Only the authenticated Homes BFF may forward Vercel's platform-overwritten client IP.
function clientIp(req, now = Date.now()) {
 const secret = process.env.CONSUMER_WEB_PROXY_SECRET;
 const ip = req.get('x-homes-web-ip'), stamp = req.get('x-homes-web-time'), signature = req.get('x-homes-web-signature');
 if(!secret || secret.length<32 || !net.isIP(ip || '') || !/^\d{13}$/.test(stamp || '') || Math.abs(now-Number(stamp))>30000 || !/^[a-f0-9]{64}$/.test(signature || '')) return req.ip;
 const payload=[req.method,req.originalUrl.split('?')[0],ip,stamp].join('\n');
 const expected=crypto.createHmac('sha256',secret).update(payload).digest();
 return crypto.timingSafeEqual(expected,Buffer.from(signature,'hex')) ? ip : req.ip;
}
module.exports = {clientIp};
