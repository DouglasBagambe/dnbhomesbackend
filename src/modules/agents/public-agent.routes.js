const router = require("express").Router();
const asyncHandler = require("../../utils/async-handler");
const service = require("./agent.service");

router.get("/agents", asyncHandler(async (req, res) => res.json(await service.listPublicAgents(req.query))));
router.get("/agents/:idOrSlug", asyncHandler(async (req, res) => res.json({ data: await service.getPublicAgent(req.params.idOrSlug) })));
router.get("/agencies", asyncHandler(async (req, res) => res.json(await service.listPublicAgencies(req.query))));
router.get("/agencies/:idOrSlug", asyncHandler(async (req, res) => res.json({ data: await service.getPublicAgency(req.params.idOrSlug) })));

module.exports = router;
