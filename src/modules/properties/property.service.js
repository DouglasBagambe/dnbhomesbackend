const mongoose = require("mongoose");
const Property = require("./property.model");
const slugify = require("../../utils/slug");
const { notFound, badRequest } = require("../../utils/errors");
const { validateProperty } = require("./property.validation");

const sortMap = { newest: { publishedAt: -1 }, oldest: { publishedAt: 1 }, price_asc: { "price.amount": 1 }, price_desc: { "price.amount": -1 }, popular: { viewCount: -1, publishedAt: -1 } };
const allowedFields = ["title", "description", "purpose", "type", "price", "location", "bedrooms", "bathrooms", "size", "sizeUnit", "amenities", "tags", "media", "cover", "agent", "agency", "featured", "verificationStatus", "status", "legacyAgent"];
const pick = (body) => Object.fromEntries(allowedFields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));

const QA_MEDIA_HOST = "https://dnbhomeswebsite-psi.vercel.app";
const QA_MEDIA_IMAGE_PATHS = [
  "/images/uganda/showcase/optimized-apartments-home.jpg",
  "/images/uganda/showcase/optimized-bweyale-garden.jpg",
  "/images/uganda/showcase/optimized-entebbe-apartment.jpg",
  "/images/uganda/showcase/optimized-fort-portal-house.jpg",
  "/images/uganda/showcase/optimized-garden.jpg",
  "/images/uganda/showcase/optimized-gated-home.jpg",
  "/images/uganda/showcase/optimized-grassland.jpg",
  "/images/uganda/showcase/optimized-home-setting.jpg",
  "/images/uganda/showcase/optimized-hotel-building.jpg",
  "/images/uganda/showcase/optimized-kampala-commercial.jpg",
  "/images/uganda/showcase/optimized-kololo-apartments.jpg",
  "/images/uganda/showcase/optimized-kololo-block.jpg",
  "/images/uganda/showcase/optimized-mukono-house.jpg",
  "/images/uganda/showcase/optimized-muzigo.jpg",
  "/images/uganda/showcase/optimized-rental-interior.jpg",
  "/images/uganda/showcase/optimized-single-room.jpg",
  "/images/uganda/showcase/optimized-urban-home.jpg",
  "/images/uganda/gated-home.jpg",
  "/images/uganda/grassland.jpg",
  "/images/uganda/hotel-building.jpg",
];
const QA_MEDIA_VIDEO_PATHS = [1,2,3,4,5].map((index) => `/qa/video-${index}.webm`);
function durableQaMedia(item) {
  const plain = item?.toObject ? item.toObject() : item;
  if (!plain || !Array.isArray(plain.tags) || !plain.tags.includes("qa:media-heavy")) return item;
  const hasEphemeralMedia = Array.isArray(plain.media) && plain.media.some((entry) =>
    typeof entry?.url === "string" && /^https:\/\/dnbhomesbackend\.onrender\.com\/media\//.test(entry.url)
  );
  if (!hasEphemeralMedia) return item;
  const media = [
    ...QA_MEDIA_IMAGE_PATHS.map((path, index) => ({ type: "image", url: `${QA_MEDIA_HOST}${path}`, alt: `Synthetic QA property image ${index + 1}` })),
    ...QA_MEDIA_VIDEO_PATHS.map((path, index) => ({ type: "video", url: `${QA_MEDIA_HOST}${path}`, alt: `Synthetic QA property video ${index + 1}` })),
  ];
  return { ...plain, media, cover: media[0] };
}

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
  if (query.q) {
    const terms = searchTerms(query.q);
    // Text-index candidates first; each significant literal must occur in the
    // indexed fields. Mongo's default OR alone makes multi-word searches broad.
    if (!terms.length) filter._id = { $in: [] };
    else {
      filter.$text = { $search: terms.join(" ") };
      filter.$and = terms.map(term => ({ $or: searchFields.map(field => ({
        [field]: new RegExp(`(?:^|[^\\p{L}\\p{N}])${termPattern(term)}(?:$|[^\\p{L}\\p{N}])`, "iu"),
      })) }));
    }
  }
  if (query.latitude && query.longitude) {
    const radius = Math.min(Math.max(Number(query.radius || 10), 1), 200) * 1000;
    filter["location.coordinates"] = { $geoWithin: { $centerSphere: [[Number(query.longitude), Number(query.latitude)], radius / 6378100] } };
  }
  return filter;
}

const searchFields = ["title", "description", "location.address", "location.area", "location.district"];
const stopWords = new Set(["a", "an", "and", "the", "in", "at", "of", "for", "to", "with"]);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pluralTerms = new Set(["apartment", "home", "house", "room", "plot", "office", "rental", "shop", "villa", "bungalow", "hotel", "bedroom", "bathroom"]);
function canonicalTerm(term) { return term.endsWith("s") && pluralTerms.has(term.slice(0,-1)) ? term.slice(0,-1) : term; }
function termPattern(term) { return `${escapeRegex(term)}${pluralTerms.has(term) ? "s?" : ""}`; }
function searchTerms(value) {
  return [...new Set((String(value).normalize("NFKC").slice(0, 100).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(term => !stopWords.has(term)).map(canonicalTerm))].slice(0, 12);
}
function relevance(query) {
  const words = String(query.q).normalize("NFKC").slice(0,100).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const phrase = words.map(escapeRegex).join("[\\s\\p{P}]+");
  const match = (field, regex, weight) => ({ $cond: [{ $regexMatch: { input: { $ifNull: [`$${field}`, ""] }, regex, options: "i" } }, weight, 0] });
  return { $add: [
    { $meta: "textScore" },
    match("title", `^\\s*${phrase}\\s*$`, 100),
    match("title", phrase, 50),
    ...searchTerms(query.q).flatMap(term => [match("title", termPattern(term), 4), match("location.area", `^${escapeRegex(term)}$`, 3)]),
  ] };
}
async function listPublic(query) {
  const page = Math.max(Number(query.page) || 1, 1); const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  const filter = publicFilter(query); const sort = { ...(sortMap[query.sort] || sortMap.newest), _id: 1 };
  let records;
  if (filter.$text) {
    // Relevance is the default for searches; explicit price/oldest/popular
    // choices retain their ordering. Stable _id tie-breaks preserve pagination.
    const searchSort = !query.sort || query.sort === "newest" ? { _searchRelevance: -1, ...sort } : sort;
    records = Property.aggregate([{ $match: filter }, { $set: { _searchRelevance: relevance(query) } }, { $sort: searchSort }, { $skip: (page-1)*limit }, { $limit: limit }, { $unset: "_searchRelevance" }]).option({ maxTimeMS: 3000 }).then(data => Property.populate(data, { path: "agent agency" }));
  } else records = Property.find(filter).populate("agent agency").sort(sort).skip((page-1)*limit).limit(limit).maxTimeMS(3000).lean();
  const [data, total] = await Promise.all([records, Property.countDocuments(filter).maxTimeMS(3000)]);
  return { data: data.map(durableQaMedia), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function getPublic(idOrSlug) {
  const selector = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const item = await Property.findOne({ ...selector, status: "published" }).populate("agent agency").lean();
  if (!item) throw notFound("Property not found");
  void Property.updateOne({ _id: item._id }, { $inc: { viewCount: 1 } }).catch(() => {});
  return durableQaMedia(item);
}

async function listAdmin(query) {
  const page = Math.max(Number(query.page) || 1, 1); const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100); const filter = {};
  for (const field of ["status", "purpose", "type", "featured", "verificationStatus", "agent", "agency"]) if (query[field] !== undefined && query[field] !== "") filter[field] = query[field];
  if (query.q) filter.$text = { $search: String(query.q).slice(0, 100) };
  const [data, total] = await Promise.all([Property.find(filter).populate("agent agency").sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit), Property.countDocuments(filter)]);
  return { data: data.map(durableQaMedia), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function create(body) { validateProperty(body); const data = pick(body); data.slug = await uniqueSlug(data.title); if (data.status === "published") data.publishedAt = new Date(); return Property.create(data); }
async function update(id, body) { if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid property identifier"); validateProperty(body, true); const property = await Property.findById(id); if (!property) throw notFound("Property not found"); const data = pick(body); if (body.media !== undefined && body.cover === undefined) data.cover = body.media.find(item => item.type === "image"); if (data.title && data.title !== property.title) data.slug = await uniqueSlug(data.title, id); if (data.status === "published" && property.status !== "published") data.publishedAt = new Date(); if (data.status === "archived") data.archivedAt = new Date(); Object.assign(property, data); return property.save(); }
async function getAdmin(id) { if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid property identifier"); const item = await Property.findById(id).populate("agent agency"); if (!item) throw notFound("Property not found"); return durableQaMedia(item); }

module.exports = { listPublic, getPublic, listAdmin, getAdmin, create, update };
