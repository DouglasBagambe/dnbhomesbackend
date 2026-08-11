const mongoose = require("mongoose");
const Property = require("./property.model");
const slugify = require("../../utils/slug");
const { notFound, badRequest } = require("../../utils/errors");
const { validateProperty } = require("./property.validation");

const sortMap = { newest: { publishedAt: -1 }, oldest: { publishedAt: 1 }, price_asc: { "price.amount": 1 }, price_desc: { "price.amount": -1 }, popular: { viewCount: -1, publishedAt: -1 } };
const allowedFields = ["title", "description", "purpose", "type", "price", "location", "bedrooms", "bathrooms", "size", "sizeUnit", "amenities", "tags", "media", "cover", "agent", "agency", "featured", "verificationStatus", "status", "legacyAgent"];
const pick = (body) => Object.fromEntries(allowedFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));

async function uniqueSlug(title, ignoredId) {
  const base = slugify(title) || "property"; let slug = base; let suffix = 2;
  while (await Property.exists({ slug, ...(ignoredId ? { _id: { $ne: ignoredId } } : {}) })) slug = `${base}-${suffix++}`;
  return slug;
}

function publicFilter(query) {
  const filter = { status: "published" };
  for (const field of ["purpose", "type", "featured"]) if (query[field] !== undefined) filter[field] = query[field];
  for (const field of ["country", "region", "district", "area"]) if (query[field]) filter[`location.${field}`] = new RegExp(`^${String(query[field]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (query.verified !== undefined) filter.verificationStatus = query.verified === "true" ? "verified" : { $ne: "verified" };
  if (query.minPrice || query.maxPrice) filter["price.amount"] = { ...(query.minPrice ? { $gte: Number(query.minPrice) } : {}), ...(query.maxPrice ? { $lte: Number(query.maxPrice) } : {}) };
  if (query.bedrooms) filter.bedrooms = { $gte: Number(query.bedrooms) };
  if (query.bathrooms) filter.bathrooms = { $gte: Number(query.bathrooms) };
  if (query.amenities) filter.amenities = { $all: String(query.amenities).split(",").map((v) => v.trim()).filter(Boolean) };
  if (query.q) filter.$text = { $search: String(query.q).slice(0, 100) };
  if (query.latitude && query.longitude) {
    const radius = Math.min(Math.max(Number(query.radius || 10), 1), 200) * 1000;
    filter["location.coordinates"] = { $geoWithin: { $centerSphere: [[Number(query.longitude), Number(query.latitude)], radius / 6378100] } };
  }
  return filter;
}

async function listPublic(query) {
  const page = Math.max(Number(query.page) || 1, 1); const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  const filter = publicFilter(query); const sort = sortMap[query.sort] || sortMap.newest;
  const [data, total] = await Promise.all([Property.find(filter).populate("agent agency").sort(sort).skip((page - 1) * limit).limit(limit).lean(), Property.countDocuments(filter)]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function getPublic(idOrSlug) {
  const selector = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const item = await Property.findOne({ ...selector, status: "published" }).populate("agent agency").lean();
  if (!item) throw notFound("Property not found");
  void Property.updateOne({ _id: item._id }, { $inc: { viewCount: 1 } }).catch(() => {});
  return item;
}

async function listAdmin(query) {
  const page = Math.max(Number(query.page) || 1, 1); const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100); const filter = {};
  for (const field of ["status", "purpose", "type", "featured", "verificationStatus", "agent", "agency"]) if (query[field] !== undefined && query[field] !== "") filter[field] = query[field];
  if (query.q) filter.$text = { $search: String(query.q).slice(0, 100) };
  const [data, total] = await Promise.all([Property.find(filter).populate("agent agency").sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit), Property.countDocuments(filter)]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function create(body) { validateProperty(body); const data = pick(body); data.slug = await uniqueSlug(data.title); if (data.status === "published") data.publishedAt = new Date(); return Property.create(data); }
async function update(id, body) { if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid property identifier"); validateProperty(body, true); const property = await Property.findById(id); if (!property) throw notFound("Property not found"); const data = pick(body); if (data.title && data.title !== property.title) data.slug = await uniqueSlug(data.title, id); if (data.status === "published" && property.status !== "published") data.publishedAt = new Date(); if (data.status === "archived") data.archivedAt = new Date(); Object.assign(property, data); return property.save(); }
async function getAdmin(id) { if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid property identifier"); const item = await Property.findById(id).populate("agent agency"); if (!item) throw notFound("Property not found"); return item; }

module.exports = { listPublic, getPublic, listAdmin, getAdmin, create, update };
