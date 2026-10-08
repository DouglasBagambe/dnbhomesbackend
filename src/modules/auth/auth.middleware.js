const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { AppError } = require("../../utils/errors");
const Admin = require("./admin.model");

async function authenticateAdmin(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
    const payload = jwt.verify(token, env.accessSecret, { issuer: "homes-api", audience: "homes-admin" });
    const admin = await Admin.findById(payload.sub).select("+tokenVersion");
    if (!admin || admin.status !== "active" || (payload.tokenVersion || 0) !== admin.tokenVersion) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
    req.admin = admin;
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, "INVALID_TOKEN", "Access token is invalid or expired"));
  }
}

const allowRoles = (...roles) => (req, res, next) => roles.includes(req.admin.role) ? next() : next(new AppError(403, "FORBIDDEN", "You do not have permission to perform this action"));

module.exports = { authenticateAdmin, allowRoles };
