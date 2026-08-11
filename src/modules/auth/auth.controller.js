const service = require("./auth.service");
const { badRequest } = require("../../utils/errors");

const context = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") });
exports.login = async (req, res) => {
  if (!req.body.email || !req.body.password) throw badRequest("Email and password are required");
  res.json({ data: await service.login(req.body.email, req.body.password, context(req)) });
};
exports.refresh = async (req, res) => {
  if (!req.body.refreshToken) throw badRequest("Refresh token is required");
  res.json({ data: await service.refresh(req.body.refreshToken, context(req)) });
};
exports.logout = async (req, res) => { await service.logout(req.body.refreshToken); res.status(204).end(); };
exports.me = async (req, res) => res.json({ data: service.publicAdmin(req.admin) });
