const mongoose = require("mongoose");
const schema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, url: { type: String, required: true }, originalName: String, type: { type: String, enum: ["image", "video"], required: true }, mimeType: String, size: Number, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }, status: { type: String, enum: ["active", "deleted"], default: "active" } }, { timestamps: true });
module.exports = mongoose.model("MediaAsset", schema);
