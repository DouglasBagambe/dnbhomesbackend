const { badRequest } = require("../utils/errors");

const cleanString = (value, max = 5000) => typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, max) : value;
const cleanObject = (value) => {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== "object") return cleanString(value);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("$") && !key.includes(".")).map(([key, child]) => [key, cleanObject(child)]));
};

function sanitize(req, res, next) {
  req.body = cleanObject(req.body || {});
  next();
}

function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter((field) => req.body[field] === undefined || req.body[field] === "");
    if (missing.length) return next(badRequest("Missing required fields", missing));
    next();
  };
}

module.exports = { sanitize, requireFields };
