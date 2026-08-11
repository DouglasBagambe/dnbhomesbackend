const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  phone: { type: String, trim: true, sparse: true },
  status: { type: String, enum: ["active", "suspended", "deleted"], default: "active", index: true },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
