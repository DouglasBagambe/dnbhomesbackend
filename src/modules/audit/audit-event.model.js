const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true }, action: { type: String, required: true, index: true },
  entityType: { type: String, required: true, index: true }, entityId: { type: mongoose.Schema.Types.ObjectId, index: true }, metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ createdAt: -1 });
module.exports = mongoose.model("AuditEvent", schema);
