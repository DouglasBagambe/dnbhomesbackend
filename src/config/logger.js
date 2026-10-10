const pino = require("pino");
const env = require("./env");

module.exports = pino({
  level: env.logLevel,
  redact: ["req.headers[\"x-homes-web-signature\"]", "req.headers[\"x-homes-web-ip\"]", "req.headers[\"x-homes-client-ip\"]", "req.headers.authorization", "req.headers.cookie", "req.headers[\"x-viewing-token\"]", "req.headers[\"x-media-upload-token\"]", "tokenHash", "statusAccessToken", "statusTokenHash", "password", "passwordHash", "refreshToken", "req.url", "req.query", "req.params", "res.headers.set-cookie", "res.headers[\"set-auth-token\"]", "otp", "token", "req.body", "res.body"],
});
