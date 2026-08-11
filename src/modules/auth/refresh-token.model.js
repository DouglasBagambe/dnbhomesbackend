const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  revokedAt: Date,
  userAgent: String,
  ip: String,
}, { timestamps: true });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
