const pino = require("pino");
const env = require("./env");

module.exports = pino({
  level: env.logLevel,
  redact: ["req.headers.authorization", "req.headers.cookie", "req.headers[\"x-viewing-token\"]", "req.headers[\"x-media-upload-token\"]", "tokenHash", "statusAccessToken", "statusTokenHash", "password", "passwordHash", "refreshToken", "req.url", "req.query", "req.params", "res.headers.set-cookie"],
});
