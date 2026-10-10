const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  consumerId: { type: String, index: true },
  statusTokenHash: { type: String, select: false },
  reference: { type: String, required: true, unique: true, index: true }, property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, guestName: String, guestEmail: { type: String, lowercase: true, trim: true }, guestPhone: String,
  scheduledAt: { type: Date, required: true, index: true }, duration: { type: Number, min: 15, max: 240 }, notes: { type: String, maxlength: 1000 }, adminNotes: { type: String, maxlength: 2000 },
  status: { type: String, enum: ["pending", "confirmed", "completed", "cancelled", "rejected", "no_show"], default: "pending", index: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true }, idempotencyKey: { type: String, sparse: true, unique: true },
}, { timestamps: true });
schema.index({ property: 1, scheduledAt: 1, guestEmail: 1 }); schema.index({ status: 1, scheduledAt: 1 });
module.exports = mongoose.model("Booking", schema);
