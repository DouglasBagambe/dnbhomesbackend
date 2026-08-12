const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  kind: { type: String, enum: ["contact", "listing"], required: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  subject: { type: String, trim: true },
  message: { type: String, required: true, trim: true },
  propertyType: { type: String, trim: true },
  location: { type: String, trim: true },
  role: { type: String, enum: ["owner", "agent", "agency", "developer"] },
  status: { type: String, enum: ["new", "in_progress", "resolved", "spam"], default: "new", index: true },
  adminNotes: { type: String, trim: true },
  source: { type: String, default: "website" },
}, { timestamps: true });

schema.index({ kind: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model("Inquiry", schema);
