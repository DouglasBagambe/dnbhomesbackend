const router = require("express").Router(); const asyncHandler = require("../../utils/async-handler"); const service = require("./booking.service");
router.post("/", asyncHandler(async (req, res) => { const result = await service.create(req.body, req.get("idempotency-key")); res.status(result.created ? 201 : 200).json({ data: result.booking, message: "Viewing request received; availability is not guaranteed until confirmed." }); }));
const rateLimit = require("express-rate-limit");
router.get("/:id/status", rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Please wait before refreshing again." } } }), asyncHandler(async (req, res) => { res.set("Cache-Control", "no-store"); res.json({ data: await service.guestStatus(req.params.id, req.get("X-Viewing-Token")) }); }));
module.exports = router;
