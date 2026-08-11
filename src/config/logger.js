const pino = require("pino");
const env = require("./env");

module.exports = pino({
  level: env.logLevel,
  redact: ["req.headers.authorization", "req.headers.cookie", "password", "passwordHash", "refreshToken"],
});
