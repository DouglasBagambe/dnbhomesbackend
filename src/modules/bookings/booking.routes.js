const router = require("express").Router(); const asyncHandler = require("../../utils/async-handler"); const service = require("./booking.service");
router.post("/", asyncHandler(async (req, res) => { const result = await service.create(req.body, req.get("idempotency-key")); res.status(result.created ? 201 : 200).json({ data: result.booking, message: "Viewing request received; availability is not guaranteed until confirmed." }); }));
module.exports = router;
