const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../../utils/async-handler");
const service = require("./inquiry.service");

const submitLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

router.post("/contact", submitLimit, asyncHandler(async (req, res) => {
  const item = await service.createContact(req.body);
  res.status(201).json({ data: { id: item.id }, message: "Thanks. Your message has been received." });
}));
router.post("/listing-inquiries", submitLimit, asyncHandler(async (req, res) => {
  const item = await service.createListing(req.body);
  res.status(201).json({ data: { id: item.id }, message: "Thanks. The Homes onboarding team will review your property details." });
}));

module.exports = router;
