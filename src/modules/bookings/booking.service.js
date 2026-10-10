const crypto = require("crypto"); const mongoose = require("mongoose"); const Booking = require("./booking.model"); const Property = require("../properties/property.model"); const { badRequest, notFound, AppError } = require("../../utils/errors");
const statuses = ["pending", "confirmed", "completed", "cancelled", "rejected", "no_show"];
async function create(body, idempotencyKey) {
  if (!mongoose.isValidObjectId(body.property)) throw badRequest("Invalid property identifier");
  if (!body.user && (!body.guestName || !body.guestEmail || !body.guestPhone)) throw badRequest("Guest name, email and phone are required");
  const scheduledAt = new Date(body.scheduledAt); if (Number.isNaN(scheduledAt.valueOf()) || scheduledAt <= new Date()) throw badRequest("scheduledAt must be a future date");
  const property = await Property.findOne({ _id: body.property, status: "published" }); if (!property) throw notFound("Property not found");
  if (idempotencyKey) { const existing = await Booking.findOne({ idempotencyKey }); if (existing) return { booking: { _id: existing._id, property: existing.property, createdAt: existing.createdAt, ...publicStatus(existing) }, created: false }; }
  const duplicate = await Booking.findOne({ property: property.id, guestEmail: String(body.guestEmail || "").toLowerCase(), scheduledAt: { $gte: new Date(scheduledAt.getTime() - 10 * 60000), $lte: new Date(scheduledAt.getTime() + 10 * 60000) }, status: { $in: ["pending", "confirmed"] } });
  if (duplicate) throw new AppError(409, "DUPLICATE_BOOKING", "A similar viewing request already exists");
  const reference = `HOM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const statusAccessToken = crypto.randomBytes(32).toString("base64url");
  const statusTokenHash = crypto.createHash("sha256").update(statusAccessToken).digest("hex");
  const booking = await Booking.create({ statusTokenHash, reference, property: property.id, user: body.user, guestName: body.guestName, guestEmail: body.guestEmail, guestPhone: body.guestPhone, scheduledAt, duration: body.duration, notes: body.notes, agent: property.agent, idempotencyKey });
  const safe = booking.toObject(); delete safe.statusTokenHash;
  return { booking: { ...safe, statusAccessToken }, created: true };
}
async function list(query) { const page = Math.max(Number(query.page) || 1, 1); const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100); const filter = {}; for (const key of ["status", "property", "agent"]) if (query[key]) filter[key] = query[key]; if (query.from || query.to) filter.scheduledAt = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) }; if (query.q) { const q = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 100), "i"); filter.$or = [{ reference: q }, { guestName: q }, { guestEmail: q }, { guestPhone: q }]; } const [data, total] = await Promise.all([Booking.find(filter).populate("property", "title slug cover").populate("agent", "name").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Booking.countDocuments(filter)]); return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }; }
async function get(id) { if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid booking identifier"); const item = await Booking.findById(id).populate("property agent user"); if (!item) throw notFound("Booking not found"); return item; }
async function updateStatus(id, status, adminNotes) { if (!statuses.includes(status)) throw badRequest("Invalid booking status"); const booking = await get(id); booking.status = status; if (adminNotes !== undefined) booking.adminNotes = adminNotes; return booking.save(); }
module.exports = { create, list, get, updateStatus };

function publicStatus(booking) {
  return { reference: booking.reference, scheduledAt: booking.scheduledAt, status: booking.status, updatedAt: booking.updatedAt };
}
async function guestStatus(identifier, token) {
  const denied = () => notFound("Viewing status unavailable");
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw denied();
  const selector = mongoose.isValidObjectId(identifier) ? { _id: identifier } : /^HOM-\d{8}-[A-F0-9]{6}$/.test(identifier) ? { reference: identifier } : null;
  if (!selector) throw denied();
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const booking = await Booking.findOne({ ...selector, statusTokenHash: hash }).select("reference scheduledAt status updatedAt").lean();
  if (!booking) throw denied();
  return publicStatus(booking);
}
module.exports.guestStatus = guestStatus;
