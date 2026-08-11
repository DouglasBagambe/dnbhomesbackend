const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../../utils/async-handler");
const controller = require("./auth.controller");
const { authenticateAdmin } = require("./auth.middleware");

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
router.post("/login", loginLimiter, asyncHandler(controller.login));
router.post("/refresh", loginLimiter, asyncHandler(controller.refresh));
router.post("/logout", asyncHandler(controller.logout));
router.get("/me", authenticateAdmin, asyncHandler(controller.me));
module.exports = router;
