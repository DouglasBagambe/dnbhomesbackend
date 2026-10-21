const crypto = require("node:crypto");
const env = require("../../config/env");
const MediaAsset = require("./media-asset.model");
const { AppError } = require("../../utils/errors");
const { createStorage, validateMedia } = require("./storage");
const extensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};
function assertUploadStorage(config = env) {
  if (
    ["staging", "production"].includes(config.env) &&
    config.mediaDriver !== "s3"
  )
    throw new AppError(
      503,
      "STORAGE_NOT_DURABLE",
      "Durable media storage is not configured. Ask an administrator to configure S3/R2 before uploading.",
    );
  try {
    createStorage(config);
  } catch {
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "Media storage is temporarily unavailable. Ask an administrator to check storage configuration.",
    );
  }
}
function health() {
  const required = [
    "endpoint",
    "region",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "publicUrl",
  ];
  return {
    driver: env.mediaDriver,
    durable: env.mediaDriver === "s3",
    configured:
      env.mediaDriver === "s3" && required.every((key) => Boolean(env.s3[key])),
    configuration: Object.fromEntries(
      required.map((key) => [key, Boolean(env.s3[key])]),
    ),
    bucket: env.s3.bucket || null,
    publicUrl:
      env.mediaDriver === "s3" ? env.s3.publicUrl || null : env.mediaPublicUrl,
    warning:
      env.mediaDriver === "local"
        ? "Local media is ephemeral on hosted Render. Do not use it for durable property uploads."
        : null,
  };
}
async function upload(file, actor) {
  validateMedia(file);
  assertUploadStorage();
  const key = `${file.mimetype.startsWith("image/") ? "images" : "videos"}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extensions[file.mimetype]}`;
  const storage = createStorage(env);
  const url = await storage.put(key, file.buffer, file.mimetype);
  try {
    return await MediaAsset.create({
      key,
      url,
      storageDriver: env.mediaDriver,
      storageBucket: env.mediaDriver === "s3" ? env.s3.bucket : undefined,
      originalName: file.originalname,
      type: file.mimetype.startsWith("image/") ? "image" : "video",
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: actor,
    });
  } catch (error) {
    await storage.remove(key);
    throw error;
  }
}
async function remove(id) {
  const asset = await MediaAsset.findById(id);
  if (!asset) throw new AppError(404, "NOT_FOUND", "Media asset not found");
  if (asset.status === "deleted") return asset;
  // Removing a library asset in use would break live listing media/cover. Detach it first.
  const Property = require("../properties/property.model");
  if (
    await Property.exists({
      $or: [
        { "media.key": asset.key },
        { "media.url": asset.url },
        { "cover.key": asset.key },
        { "cover.url": asset.url },
      ],
    })
  )
    throw new AppError(
      409,
      "MEDIA_IN_USE",
      "Remove this media from its properties before deleting it",
    );
  if (asset.storageBucket && asset.storageBucket !== env.s3.bucket)
    throw new AppError(
      409,
      "STORAGE_MISMATCH",
      "This media belongs to a different storage bucket",
    );
  // Legacy records infer from URL only; never turn a former local object into an S3 delete.
  const driver =
    asset.storageDriver ||
    (asset.url.startsWith(`${env.mediaPublicUrl.replace(/\/$/, "")}/`)
      ? "local"
      : env.mediaDriver);
  if (driver !== env.mediaDriver)
    throw new AppError(
      409,
      "STORAGE_MISMATCH",
      "This media belongs to a different storage provider",
    );
  await createStorage(env).remove(asset.key);
  asset.status = "deleted";
  await asset.save();
  return asset;
}
module.exports = { upload, remove, health, assertUploadStorage };
