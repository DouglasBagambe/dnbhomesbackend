const fs = require("node:fs/promises");
const path = require("node:path");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { AppError } = require("../../utils/errors");
const keyPattern =
  /^(images|videos)\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.(jpg|png|webp|avif|mp4|webm)$/;
function createStorage(config, client) {
  const s3 = config.mediaDriver === "s3";
  if (!s3 && config.mediaDriver !== "local")
    throw new Error("Unsupported media storage driver");
  if (!s3 && config.env === "production")
    throw new Error("Production media cannot use ephemeral storage");
  const values = config.s3 || {};
  if (
    s3 &&
    ["endpoint", "bucket", "accessKeyId", "secretAccessKey", "publicUrl"].some(
      (key) => !values[key],
    )
  )
    throw new Error("S3/R2 media configuration is incomplete");
  const transport = s3
    ? client ||
      new S3Client({
        endpoint: values.endpoint,
        region: values.region || "auto",
        credentials: {
          accessKeyId: values.accessKeyId,
          secretAccessKey: values.secretAccessKey,
        },
        forcePathStyle: true,
        maxAttempts: 3,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      })
    : null;
  const target = (key) => {
    if (!keyPattern.test(key))
      throw new AppError(400, "INVALID_PATH", "Invalid media object key");
    return path.join(config.mediaLocalPath || "", key);
  };
  const safely = async (operation) => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) throw error;
      require("../../config/logger").error(
        {
          code: "STORAGE_UNAVAILABLE",
          driver: config.mediaDriver,
          storageErrorType: /^[A-Za-z0-9_]+$/.test(error.name || "")
            ? error.name
            : "StorageError",
          storageStatus: error.$metadata?.httpStatusCode,
        },
        "Media storage operation failed",
      );
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Media storage is temporarily unavailable. Please try again.",
      );
    }
  };
  return {
    async put(key, buffer, mimeType) {
      target(key);
      await safely(async () => {
        if (s3)
          await transport.send(
            new PutObjectCommand({
              Bucket: values.bucket,
              Key: key,
              Body: buffer,
              ContentType: mimeType,
              CacheControl: "public, max-age=31536000, immutable",
            }),
            { abortSignal: AbortSignal.timeout(30000) },
          );
        else {
          await fs.mkdir(path.dirname(target(key)), { recursive: true });
          await fs.writeFile(target(key), buffer);
        }
      });
      return `${(s3 ? values.publicUrl : config.mediaPublicUrl).replace(/\/$/, "")}/${key}`;
    },
    async remove(key) {
      target(key);
      await safely(async () => {
        if (s3)
          await transport.send(
            new DeleteObjectCommand({ Bucket: values.bucket, Key: key }),
            { abortSignal: AbortSignal.timeout(15000) },
          );
        else
          await fs.unlink(target(key)).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
      });
    },
  };
}
function validateMedia(file) {
  const bytes = file.buffer;
  const type = file.mimetype;
  const header = bytes.subarray(0, 64);
  const ascii = header.toString("latin1");
  const is = {
    "image/jpeg":
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255,
    "image/png":
      bytes.length >= 24 &&
      header
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      ascii.slice(12, 16) === "IHDR",
    "image/webp": ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP",
    "image/avif":
      ascii.slice(4, 8) === "ftyp" && /avif|avis/.test(ascii.slice(8)),
    "video/mp4":
      ascii.slice(4, 8) === "ftyp" &&
      /isom|iso2|mp4[12]|avc1|M4V |qt  /.test(ascii.slice(8)),
    "video/webm":
      header.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) &&
      bytes.subarray(0, 4096).includes(Buffer.from("webm")),
  };
  if (!is[type] || file.size !== bytes.length)
    throw new AppError(
      400,
      "INVALID_MEDIA_CONTENT",
      "The file content does not match a supported image or video type",
    );
  if (bytes.length > (type.startsWith("image/") ? 10 : 50) * 1024 * 1024)
    throw new AppError(
      413,
      "MEDIA_TOO_LARGE",
      "Images must not exceed 10 MB; videos must not exceed 50 MB",
    );
}
module.exports = { createStorage, validateMedia };
