const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { AppError } = require("../../utils/errors");
const Admin = require("./admin.model");
const RefreshToken = require("./refresh-token.model");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const publicAdmin = (admin) => ({ id: admin.id, name: admin.name, email: admin.email, role: admin.role, status: admin.status });

async function issueTokens(admin, context = {}) {
  const accessToken = jwt.sign({ sub: admin.id, role: admin.role, type: "admin" }, env.accessSecret, { expiresIn: env.accessTtl, issuer: "homes-api", audience: "homes-admin" });
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({ admin: admin.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + env.refreshDays * 86400000), userAgent: context.userAgent, ip: context.ip });
  return { accessToken, refreshToken, expiresIn: env.accessTtl, admin: publicAdmin(admin) };
}

async function login(email, password, context) {
  const admin = await Admin.findOne({ email: String(email).toLowerCase() }).select("+passwordHash +tokenVersion");
  if (!admin || admin.status !== "active" || !(await bcrypt.compare(password, admin.passwordHash))) throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  admin.lastLoginAt = new Date(); await admin.save();
  return issueTokens(admin, context);
}

async function refresh(rawToken, context) {
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken), revokedAt: null, expiresAt: { $gt: new Date() } }).populate("admin");
  if (!stored || !stored.admin || stored.admin.status !== "active") throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  stored.revokedAt = new Date(); await stored.save();
  return issueTokens(stored.admin, context);
}

async function logout(rawToken) {
  if (rawToken) await RefreshToken.updateOne({ tokenHash: hashToken(rawToken) }, { revokedAt: new Date() });
}

module.exports = { login, refresh, logout, publicAdmin };
