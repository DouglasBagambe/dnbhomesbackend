const mongoose = require("mongoose");
const Property = require("../properties/property.model");
const Booking = require("../bookings/booking.model");
const Agent = require("../agents/agent.model");
const Agency = require("../agents/agency.model");
const Inquiry = require("../inquiries/inquiry.model");
const Asset = require("../media/media-asset.model");
const Event = require("../audit/audit-event.model");
const Admin = require("../auth/admin.model");
const RefreshToken = require("../auth/refresh-token.model");
const audit = require("../audit/audit.service");
const { badRequest, notFound, AppError } = require("../../utils/errors");
const Deletion = mongoose.model(
  "PropertyDeletion",
  new mongoose.Schema(
    {
      _id: mongoose.Schema.Types.ObjectId,
      title: String,
      actor: mongoose.Schema.Types.ObjectId,
      snapshot: mongoose.Schema.Types.Mixed,
      assets: [mongoose.Schema.Types.ObjectId],
      cleanupPending: [mongoose.Schema.Types.ObjectId],
      complete: Boolean,
    },
    { timestamps: true },
  ),
);
const Lock = mongoose.model(
  "AdminOperationLock",
  new mongoose.Schema({ _id: String, expires: Date, owner: String }),
);
async function withLock(key, work) {
  const owner = require("crypto").randomUUID();
  try {
    await Lock.findOneAndUpdate(
      { _id: key, $or: [{ expires: { $lt: new Date() } }, { owner }] },
      { $set: { expires: new Date(Date.now() + 120000), owner } },
      { upsert: true },
    );
  } catch (e) {
    if (e.code === 11000)
      throw new AppError(
        409,
        "BUSY",
        "Another operation is in progress. Please retry.",
      );
    throw e;
  }
  try {
    return await work();
  } finally {
    await Lock.deleteOne({ _id: key, owner });
  }
}
function identifier(id) {
  if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid identifier");
}
async function assignment(data, previous) {
  const id = (value) => value?._id?.toString() || value?.toString() || "";
  const agentId = data.agent !== undefined ? data.agent : previous?.agent;
  let agencyId = data.agency !== undefined ? data.agency : previous?.agency;
  const changed =
    !previous ||
    ("agent" in data && id(agentId) !== id(previous.agent)) ||
    ("agency" in data && id(agencyId) !== id(previous.agency));
  const publishing = data.status === "published";
  if (agentId) {
    identifier(agentId);
    const agent = await Agent.findById(agentId);
    if (!agent) throw badRequest("Assigned agent does not exist");
    if ((changed || publishing) && agent.status !== "active")
      throw badRequest(
        "Inactive agents cannot receive new assignments or published listings",
      );
    if (agent.agency) {
      if ("agency" in data && agencyId && id(agencyId) !== id(agent.agency))
        throw badRequest("The selected agent belongs to a different agency");
      if (!changed && agencyId && id(agencyId) !== id(agent.agency))
        throw badRequest("Resolve the agent and agency mismatch before saving");
      agencyId = agent.agency;
      data.agency = agencyId;
    }
  }
  if (agencyId) {
    identifier(agencyId);
    const agency = await Agency.findById(agencyId);
    if (!agency) throw badRequest("Assigned agency does not exist");
    if ((changed || publishing) && agency.status !== "active")
      throw badRequest(
        "Inactive agencies cannot receive new assignments or published listings",
      );
  }
}
async function dependencies(id) {
  identifier(id);
  const property = await Property.findById(id).lean();
  if (!property) throw notFound("Property not found");
  const viewingCount = await Booking.countDocuments({ property: id });
  return {
    title: property.title,
    viewings: viewingCount,
    media: property.media.length,
    agent: property.agent,
    agency: property.agency,
    viewCount: property.viewCount,
    inquiries: 0,
    historyPolicy:
      "Viewing records and their contacts, notes, status and schedule are retained with a property title snapshot. Inquiry records are independent of properties. Agent and agency profiles and prior audit events are retained.",
  };
}
async function permanentDelete(id, body, actor) {
  identifier(id);
  return withLock(`property-delete:${id}`, async () => {
    let property = await Property.findById(id);
    let job = await Deletion.findById(id);
    if (!property && !job) throw notFound("Property not found");
    const title = job?.title || property.title;
    if (
      body.confirmed !== true ||
      !["DELETE", title].includes(body.confirmation)
    )
      throw badRequest(
        "Type the property title or DELETE and explicitly confirm permanent deletion",
      );
    if (!job) {
      const snapshot = await dependencies(id);
      const media = [
        ...property.media,
        ...(property.cover ? [property.cover] : []),
      ];
      const keys = media.map((m) => m.key).filter(Boolean),
        urls = media.map((m) => m.url);
      const assets = await Asset.find({
        $or: [{ key: { $in: keys } }, { url: { $in: urls } }],
      })
        .select("_id")
        .lean();
      job = await Deletion.create({
        _id: id,
        title,
        actor,
        snapshot,
        assets: assets.map((a) => a._id),
        cleanupPending: assets.map((a) => a._id),
        complete: false,
      });
    }
    if (property) {
      // Hide first. A failed later step remains retryable and cannot republish.
      property.status = "archived";
      property.deletionPending = true;
      await property.save();
      await Booking.updateMany(
        { property: id },
        {
          $set: {
            propertySnapshot: {
              title,
              slug: property.slug,
              propertyId: id,
              deleted: true,
            },
          },
        },
      );
      await Event.updateOne(
        { action: "property.delete", entityId: id },
        {
          $setOnInsert: {
            actor: job.actor,
            action: "property.delete",
            entityType: "Property",
            entityId: id,
            metadata: { title, ...job.snapshot, deletionId: id },
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
      await Property.deleteOne({ _id: id, deletionPending: true });
    }
    const pending = [],
      shared = [];
    for (const assetId of job.cleanupPending) {
      try {
        await require("../media/media.service").remove(assetId);
      } catch (e) {
        if (e.code === "MEDIA_IN_USE") shared.push(String(assetId));
        else if (e.status !== 404) pending.push(assetId);
      }
    }
    job.cleanupPending = pending;
    job.complete = true;
    await job.save();
    return {
      deleted: true,
      title,
      retainedViewings: job.snapshot.viewings,
      cleanupPending: pending.length,
      sharedMediaRetained: shared.length,
    };
  });
}
const bulkChanges = {
  publish: { status: "published" },
  archive: { status: "archived" },
  restore: { status: "draft" },
  verify: { verificationStatus: "verified" },
  unverify: { verificationStatus: "unverified" },
  feature: { featured: true },
  unfeature: { featured: false },
};
async function bulk(body, actor) {
  if (
    !bulkChanges[body.action] ||
    !Array.isArray(body.ids) ||
    !body.ids.length ||
    body.ids.length > 100
  )
    throw badRequest("Choose an allowed action and 1–100 properties");
  const ids = [...new Set(body.ids)];
  ids.forEach(identifier);
  const results = [];
  for (const id of ids) {
    try {
      const item = await require("../properties/property.service").update(
        id,
        bulkChanges[body.action],
      );
      await audit.record(
        actor,
        `property.bulk.${body.action}`,
        "Property",
        item.id,
        { title: item.title, ...bulkChanges[body.action] },
      );
      results.push({ id, success: true });
    } catch (e) {
      results.push({
        id,
        success: false,
        message: e.status < 500 ? e.message : "Unable to update this property",
      });
    }
  }
  return {
    results,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };
}
async function updateAdmin(id, body, actor) {
  identifier(id);
  return withLock("active-super-admins", async () => {
    const item = await Admin.findById(id).select("+tokenVersion");
    if (!item) throw notFound("Admin not found");
    if (
      body.role !== undefined &&
      !["super_admin", "admin", "editor"].includes(body.role)
    )
      throw badRequest("Invalid role");
    if (
      body.status !== undefined &&
      !["active", "suspended"].includes(body.status)
    )
      throw badRequest("Invalid status");
    if (
      item.role === "super_admin" &&
      item.status === "active" &&
      ((body.role && body.role !== "super_admin") ||
        body.status === "suspended") &&
      (await Admin.countDocuments({ role: "super_admin", status: "active" })) <=
        1
    )
      throw new AppError(
        409,
        "LAST_SUPER_ADMIN",
        "Keep at least one active super administrator. Create or reactivate another first.",
      );
    const revoke =
      Boolean(body.password) ||
      (body.status && body.status !== item.status) ||
      (body.role && body.role !== item.role);
    for (const field of ["name", "role", "status"])
      if (body[field] !== undefined) item[field] = body[field];
    if (body.password) {
      if (typeof body.password !== "string" || body.password.length < 12)
        throw badRequest("Password must contain at least 12 characters");
      item.passwordHash = await require("bcryptjs").hash(body.password, 12);
    }
    if (revoke) item.tokenVersion += 1;
    await item.save();
    if (revoke) await RefreshToken.deleteMany({ admin: item.id });
    await audit.record(actor, "admin.update", "Admin", item.id, {
      role: item.role,
      status: item.status,
      sessionsRevoked: revoke,
      passwordChanged: Boolean(body.password),
    });
    return item;
  });
}
async function dashboard(role) {
  const counts = await Promise.all([
    Property.countDocuments({ status: { $ne: "archived" } }),
    Property.countDocuments({ status: "published" }),
    Property.countDocuments({ status: "draft" }),
    Property.countDocuments({ status: "pending_review" }),
    Property.countDocuments({ status: "archived" }),
    Property.countDocuments({
      status: { $ne: "archived" },
      verificationStatus: "verified",
    }),
    Property.countDocuments({
      status: { $ne: "archived" },
      verificationStatus: "unverified",
    }),
    Agent.countDocuments({ status: "active" }),
  ]);
  const [
    properties,
    published,
    drafts,
    pendingReview,
    archived,
    verified,
    unverified,
    agents,
  ] = counts;
  const data = {
    properties,
    published,
    drafts,
    pendingReview,
    archived,
    verified,
    unverified,
    agents,
  };
  if (role !== "editor") {
    // EAT has no daylight-saving transitions. Today's boundary is 21:00 UTC.
    const now = new Date(),
      day = new Date(now.getTime() + 10800000);
    day.setUTCHours(0, 0, 0, 0);
    const from = new Date(day.getTime() - 10800000),
      to = new Date(from.getTime() + 86400000);
    [
      data.pendingBookings,
      data.todayBookings,
      data.upcomingBookings,
      data.newInquiries,
    ] = await Promise.all([
      Booking.countDocuments({ status: "pending" }),
      Booking.countDocuments({
        scheduledAt: { $gte: from, $lt: to },
        status: { $in: ["pending", "confirmed"] },
      }),
      Booking.countDocuments({
        scheduledAt: { $gte: now },
        status: { $in: ["pending", "confirmed"] },
      }),
      Inquiry.countDocuments({ status: "new" }),
    ]);
  }
  return data;
}
module.exports = {
  assignment,
  dependencies,
  permanentDelete,
  bulk,
  updateAdmin,
  dashboard,
  bulkChanges,
};
