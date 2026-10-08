const pino = require("pino");
const env = require("./env");

module.exports = pino({
  level: env.logLevel,
  redact: ["req.headers.authorization", "req.headers.cookie", "password", "passwordHash", "refreshToken", "req.url", "req.query", "req.params", "res.headers.set-cookie"],
});
