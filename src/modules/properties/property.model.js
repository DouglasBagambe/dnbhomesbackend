const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema({ url: { type: String, required: true }, key: String, type: { type: String, enum: ["image", "video"], required: true }, alt: String, width: Number, height: Number, size: Number, mimeType: String }, { _id: false });
const pointSchema = new mongoose.Schema({ type: { type: String, enum: ["Point"], required: true }, coordinates: { type: [Number], required: true, validate: (value) => value.length === 2 } }, { _id: false });
const locationSchema = new mongoose.Schema({
  country: { type: String, default: "Uganda", index: true }, region: { type: String, default: "" }, district: { type: String, default: "" }, area: { type: String, default: "" }, address: { type: String, default: "" },
  coordinates: { type: pointSchema, default: undefined },
}, { _id: false });
const priceSchema = new mongoose.Schema({ amount: { type: Number, required: true, min: 0 }, currency: { type: String, enum: ["UGX", "USD"], default: "UGX" }, period: { type: String, enum: ["total", "month", "week", "night"], default: "total" } }, { _id: false });

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, slug: { type: String, required: true, unique: true, index: true }, description: { type: String, required: true },
  purpose: { type: String, enum: ["rent", "sale", "short_stay"], required: true, index: true },
  type: { type: String, enum: ["apartment", "house", "land", "commercial", "hotel", "guest_house", "serviced_apartment", "other"], required: true, index: true },
  price: { type: priceSchema, required: true }, location: { type: locationSchema, required: true },
  bedrooms: { type: Number, min: 0 }, bathrooms: { type: Number, min: 0 }, size: { type: Number, min: 0 }, sizeUnit: { type: String, enum: ["sqm", "sqft", "acres", "hectares"], default: "sqm" },
  amenities: [{ type: String, trim: true }], tags: [{ type: String, trim: true }], media: [mediaSchema], cover: mediaSchema,
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true }, agency: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", index: true },
  legacyAgent: { name: String, phone: String, email: String, photo: String, company: String, position: String },
  featured: { type: Boolean, default: false, index: true }, verificationStatus: { type: String, enum: ["unverified", "pending", "verified", "rejected"], default: "unverified", index: true },
  status: { type: String, enum: ["draft", "pending_review", "published", "archived"], default: "draft", index: true },
  publishedAt: Date, viewCount: { type: Number, default: 0, min: 0 }, archivedAt: Date,
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, publishedAt: -1 });
schema.index({ status: 1, purpose: 1, type: 1, "price.amount": 1 });
schema.index({ status: 1, featured: 1, publishedAt: -1 });
schema.index({ "location.region": 1, "location.district": 1, "location.area": 1 });
schema.index({ "location.coordinates": "2dsphere" }, { sparse: true });
schema.index({ title: "text", description: "text", "location.address": "text", "location.area": "text", "location.district": "text" });

module.exports = mongoose.model("Property", schema);
