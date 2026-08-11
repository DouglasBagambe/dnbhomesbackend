const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, slug: { type: String, required: true, unique: true, index: true },
  logo: String, phone: String, email: { type: String, lowercase: true, trim: true }, website: String, description: String,
  verificationStatus: { type: String, enum: ["unverified", "pending", "verified", "rejected"], default: "unverified", index: true },
  status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
}, { timestamps: true });
module.exports = mongoose.model("Agency", schema);
