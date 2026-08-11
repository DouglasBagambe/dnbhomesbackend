const router = require("express").Router(); const asyncHandler = require("../../utils/async-handler"); const controller = require("./property.controller");
router.get("/", asyncHandler(controller.listPublic)); router.get("/:idOrSlug", asyncHandler(controller.getPublic)); module.exports = router;
