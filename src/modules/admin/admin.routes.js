const router = require("express").Router();
const asyncHandler = require("../../utils/async-handler");
const { authenticateAdmin, allowRoles } = require("../auth/auth.middleware");
const propertyController = require("../properties/property.controller");
const propertyService = require("../properties/property.service");
const bookingService = require("../bookings/booking.service");
const agentService = require("../agents/agent.service");
const inquiryService = require("../inquiries/inquiry.service");
const audit = require("../audit/audit.service");
const Admin = require("../auth/admin.model");
const Property = require("../properties/property.model");
const Booking = require("../bookings/booking.model");
const Agent = require("../agents/agent.model");
const Inquiry = require("../inquiries/inquiry.model");
const RefreshToken = require("../auth/refresh-token.model");
const bcrypt = require("bcryptjs");
const { badRequest, notFound } = require("../../utils/errors");
const operations = require("./operations.service");
router.use(authenticateAdmin);
function propertyInputForRole(body, role) {
  const input = { ...body };
  if (role === "editor") {
    delete input.featured;
    delete input.verificationStatus;
    if (["published", "archived"].includes(input.status)) delete input.status;
  }
  return input;
}
router.get(
  "/dashboard",
  asyncHandler(async (req, res) =>
    res.json({ data: await operations.dashboard(req.admin.role) }),
  ),
);
router.post(
  "/properties/bulk",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) =>
    res.json({ data: await operations.bulk(req.body, req.admin.id) }),
  ),
);
router.get(
  "/properties/:id/dependencies",
  allowRoles("super_admin"),
  asyncHandler(async (req, res) =>
    res.json({ data: await operations.dependencies(req.params.id) }),
  ),
);
router.delete(
  "/properties/:id",
  allowRoles("super_admin"),
  asyncHandler(async (req, res) =>
    res.json({
      data: await operations.permanentDelete(
        req.params.id,
        req.body,
        req.admin.id,
      ),
    }),
  ),
);
router.get("/properties", asyncHandler(propertyController.listAdmin));
router.get("/properties/:id", asyncHandler(propertyController.getAdmin));
router.post(
  "/properties",
  allowRoles("super_admin", "admin", "editor"),
  asyncHandler(async (req, res) => {
    const item = await propertyService.create(
      propertyInputForRole(req.body, req.admin.role),
    );
    await audit.record(req.admin.id, "property.create", "Property", item.id);
    res.status(201).json({ data: item });
  }),
);
router.patch(
  "/properties/:id",
  allowRoles("super_admin", "admin", "editor"),
  asyncHandler(async (req, res) => {
    req.body = propertyInputForRole(req.body, req.admin.role);
    const before = await propertyService.getAdmin(req.params.id);
    if (
      req.admin.role === "editor" &&
      ["published", "archived"].includes(before.status)
    )
      delete req.body.status;
    const item = await propertyService.update(req.params.id, req.body);
    await audit.record(req.admin.id, "property.update", "Property", item.id, {
      title: item.title,
      fields: Object.keys(req.body),
    });
    for (const [field, action] of [
      [
        "status",
        {
          published: "publish",
          archived: "archive",
          draft: "restore",
          pending_review: "review",
        }[item.status],
      ],
      ["verificationStatus", "verification"],
      ["featured", "feature"],
    ])
      if (String(before[field]) !== String(item[field]))
        await audit.record(
          req.admin.id,
          `property.${action}`,
          "Property",
          item.id,
          { title: item.title, before: before[field], after: item[field] },
        );
    res.json({ data: item });
  }),
);
router.post(
  "/properties/:id/publish",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await propertyService.update(req.params.id, {
      status: "published",
    });
    await audit.record(req.admin.id, "property.publish", "Property", item.id);
    res.json({ data: item });
  }),
);
router.post(
  "/properties/:id/archive",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await propertyService.update(req.params.id, {
      status: "archived",
    });
    await audit.record(req.admin.id, "property.archive", "Property", item.id);
    res.json({ data: item });
  }),
);
router.post(
  "/properties/:id/feature",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const current = await propertyService.getAdmin(req.params.id);
    const item = await propertyService.update(req.params.id, {
      featured: req.body.featured ?? !current.featured,
    });
    await audit.record(req.admin.id, "property.feature", "Property", item.id, {
      featured: item.featured,
    });
    res.json({ data: item });
  }),
);
router.get(
  "/bookings",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) =>
    res.json(await bookingService.list(req.query)),
  ),
);
router.get(
  "/bookings/:id",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) =>
    res.json({ data: await bookingService.get(req.params.id) }),
  ),
);
router.patch(
  "/bookings/:id/status",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await bookingService.updateStatus(
      req.params.id,
      req.body.status,
      req.body.adminNotes,
    );
    await audit.record(req.admin.id, "booking.status", "Booking", item.id, {
      status: item.status,
      adminNotesSubmitted: req.body.adminNotes !== undefined,
    });
    res.json({ data: item });
  }),
);
router.get(
  "/agents",
  asyncHandler(async (req, res) =>
    res.json(await agentService.listAgents(req.query)),
  ),
);
router.get(
  "/agents/:id",
  asyncHandler(async (req, res) =>
    res.json({ data: await agentService.getAgent(req.params.id) }),
  ),
);
router.post(
  "/agents",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await agentService.saveAgent(req.body);
    await audit.record(req.admin.id, "agent.create", "Agent", item.id);
    res.status(201).json({ data: item });
  }),
);
router.patch(
  "/agents/:id",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await agentService.saveAgent(req.body, req.params.id);
    await audit.record(req.admin.id, "agent.update", "Agent", item.id, {
      verificationStatus: item.verificationStatus,
    });
    res.json({ data: item });
  }),
);
router.get(
  "/agencies",
  asyncHandler(async (req, res) =>
    res.json(await agentService.listAgencies(req.query)),
  ),
);
router.post(
  "/agencies",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await agentService.saveAgency(req.body);
    await audit.record(req.admin.id, "agency.create", "Agency", item.id);
    res.status(201).json({ data: item });
  }),
);
router.patch(
  "/agencies/:id",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await agentService.saveAgency(req.body, req.params.id);
    await audit.record(req.admin.id, "agency.update", "Agency", item.id, {
      status: item.status,
      verificationStatus: item.verificationStatus,
    });
    res.json({ data: item });
  }),
);
router.get(
  "/inquiries",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) =>
    res.json(await inquiryService.list(req.query)),
  ),
);
router.patch(
  "/inquiries/:id",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => {
    const item = await inquiryService.update(req.params.id, req.body);
    await audit.record(req.admin.id, "inquiry.update", "Inquiry", item.id, {
      status: item.status,
      adminNotesSubmitted: req.body.adminNotes !== undefined,
    });
    res.json({ data: item });
  }),
);
router.get(
  "/audit",
  allowRoles("super_admin", "admin"),
  asyncHandler(async (req, res) => res.json(await audit.list(req.query))),
);
router.get(
  "/admins",
  allowRoles("super_admin"),
  asyncHandler(async (req, res) =>
    res.json({ data: await Admin.find().sort({ createdAt: -1 }) }),
  ),
);
router.post(
  "/admins",
  allowRoles("super_admin"),
  asyncHandler(async (req, res) => {
    if (
      !req.body.name ||
      !req.body.email ||
      !req.body.password ||
      !["super_admin", "admin", "editor"].includes(req.body.role)
    )
      throw badRequest("Valid name, email, password and role are required");
    if (req.body.password.length < 12)
      throw badRequest("Password must contain at least 12 characters");
    const item = await Admin.create({
      name: req.body.name,
      email: req.body.email,
      passwordHash: await bcrypt.hash(req.body.password, 12),
      role: req.body.role,
    });
    await audit.record(req.admin.id, "admin.create", "Admin", item.id, {
      role: item.role,
    });
    res.status(201).json({ data: item });
  }),
);
router.patch(
  "/admins/:id",
  allowRoles("super_admin"),
  asyncHandler(async (req, res) =>
    res.json({
      data: await operations.updateAdmin(req.params.id, req.body, req.admin.id),
    }),
  ),
);
router.use("/media", require("../media/media.routes"));
module.exports = router;
