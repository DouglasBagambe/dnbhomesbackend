const mongoose = require("mongoose");
const Agent = require("./agent.model");
const Agency = require("./agency.model");
const Property = require("../properties/property.model");
const slugify = require("../../utils/slug");
const { badRequest, notFound } = require("../../utils/errors");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const selector = (idOrSlug) => mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };

async function uniqueSlug(Model, name, id) {
  const base = slugify(name) || "profile";
  let slug = base;
  let n = 2;
  while (await Model.exists({ slug, ...(id ? { _id: { $ne: id } } : {}) })) slug = `${base}-${n++}`;
  return slug;
}

async function list(Model, query, publicOnly = false) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), publicOnly ? 50 : 100);
  const filter = publicOnly ? { status: "active" } : {};
  if (!publicOnly && query.status) filter.status = query.status;
  if (query.verificationStatus) filter.verificationStatus = query.verificationStatus;
  if (query.q) filter.name = new RegExp(escapeRegex(String(query.q).slice(0, 100)), "i");
  let request = Model.find(filter);
  if (Model === Agent) request = request.populate("agency", "name slug logo verificationStatus status");
  const [records, total] = await Promise.all([
    request.sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Model.countDocuments(filter),
  ]);
  const ids = records.map((item) => item._id);
  const listingCounts = await Property.aggregate([
    { $match: { status: "published", [Model === Agent ? "agent" : "agency"]: { $in: ids } } },
    { $group: { _id: `$${Model === Agent ? "agent" : "agency"}`, count: { $sum: 1 } } },
  ]);
  const counts = new Map(listingCounts.map(({ _id, count }) => [String(_id), count]));
  const data = records.map((item) => ({ ...item, listingCount: counts.get(String(item._id)) || 0 }));
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function save(Model, body, id) {
  if (!body.name) throw badRequest("Name is required");
  let item;
  if (id) {
    if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid identifier");
    item = await Model.findById(id);
    if (!item) throw notFound("Record not found");
  } else item = new Model();
  const previousName = item.name;
  const allowed = Model === Agent
    ? ["name", "agency", "phone", "whatsapp", "email", "photo", "verificationStatus", "status"]
    : ["name", "logo", "phone", "email", "website", "description", "verificationStatus", "status"];
  for (const key of allowed) if (body[key] !== undefined) item[key] = body[key];
  if (!item.slug || previousName !== item.name) item.slug = await uniqueSlug(Model, item.name, id);
  return item.save();
}

async function getAgent(id) {
  if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid agent identifier");
  const agent = await Agent.findById(id).populate("agency");
  if (!agent) throw notFound("Agent not found");
  const listings = await Property.find({ agent: id }).select("title slug status cover").sort({ updatedAt: -1 });
  return { agent, listings };
}

async function getPublicAgent(idOrSlug) {
  const agent = await Agent.findOne({ ...selector(idOrSlug), status: "active" })
    .select("name slug agency phone whatsapp email photo verificationStatus")
    .populate("agency", "name slug logo verificationStatus status")
    .lean();
  if (!agent) throw notFound("Agent not found");
  const listings = await Property.find({ agent: agent._id, status: "published" }).sort({ featured: -1, publishedAt: -1 }).lean();
  return { ...agent, listingCount: listings.length, listings };
}

async function getPublicAgency(idOrSlug) {
  const agency = await Agency.findOne({ ...selector(idOrSlug), status: "active" })
    .select("name slug logo phone email website description verificationStatus")
    .lean();
  if (!agency) throw notFound("Agency not found");
  const [listings, agents] = await Promise.all([
    Property.find({ agency: agency._id, status: "published" }).sort({ featured: -1, publishedAt: -1 }).lean(),
    Agent.find({ agency: agency._id, status: "active" }).select("name slug photo verificationStatus").sort({ name: 1 }).lean(),
  ]);
  return { ...agency, listingCount: listings.length, listings, agents };
}

module.exports = {
  listAgents: (q) => list(Agent, q),
  listAgencies: (q) => list(Agency, q),
  listPublicAgents: (q) => list(Agent, q, true),
  listPublicAgencies: (q) => list(Agency, q, true),
  saveAgent: (b, id) => save(Agent, b, id),
  saveAgency: (b, id) => save(Agency, b, id),
  getAgent,
  getPublicAgent,
  getPublicAgency,
};
