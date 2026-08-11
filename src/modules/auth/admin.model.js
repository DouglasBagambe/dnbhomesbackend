const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["super_admin", "admin", "editor"], required: true },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  tokenVersion: { type: Number, default: 0, select: false },
  lastLoginAt: Date,
  passwordResetHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
}, { timestamps: true });

module.exports = mongoose.model("Admin", adminSchema);
