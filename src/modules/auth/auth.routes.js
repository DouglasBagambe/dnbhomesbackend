const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../../utils/async-handler");
const controller = require("./auth.controller");
const { authenticateAdmin } = require("./auth.middleware");

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Please try again shortly." } } });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many refresh requests. Please try again shortly." } } });
router.post("/login", loginLimiter, asyncHandler(controller.login));
router.post("/refresh", refreshLimiter, asyncHandler(controller.refresh));
router.post("/logout", asyncHandler(controller.logout));
router.get("/me", authenticateAdmin, asyncHandler(controller.me));
module.exports = router;
