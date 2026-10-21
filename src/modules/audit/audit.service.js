const AuditEvent = require("./audit-event.model");
exports.record = (actor, action, entityType, entityId, metadata = {}) =>
  AuditEvent.create({ actor, action, entityType, entityId, metadata });
exports.list = async (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
  const filter = {};
  if (query.actor) {
    if (!require("mongoose").isValidObjectId(query.actor))
      throw require("../../utils/errors").badRequest(
        "Invalid actor identifier",
      );
    filter.actor = query.actor;
  }
  if (query.from || query.to) {
    const from = query.from && new Date(query.from),
      to = query.to && new Date(query.to);
    if (
      (from && !Number.isFinite(+from)) ||
      (to && !Number.isFinite(+to)) ||
      (from && to && from > to)
    )
      throw require("../../utils/errors").badRequest(
        "Invalid audit date range",
      );
    filter.createdAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  const [data, total] = await Promise.all([
    AuditEvent.find(filter)
      .populate("actor", "name email role")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditEvent.countDocuments(filter),
  ]);
  return {
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};
