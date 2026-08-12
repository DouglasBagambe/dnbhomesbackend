const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: process.env.ENV_FILE || path.resolve(process.cwd(), ".env") });

const environment = process.env.NODE_ENV || "development";
const required = ["MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
if (environment === "production") {
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
  if ((process.env.JWT_ACCESS_SECRET || "").length < 32 || (process.env.JWT_REFRESH_SECRET || "").length < 32) {
    throw new Error("JWT secrets must each contain at least 32 characters");
  }
  if (environment === "production" && !process.env.CORS_ORIGINS) throw new Error("CORS_ORIGINS is required in production");
  if (environment === "production" && process.env.MEDIA_DRIVER !== "s3") throw new Error("Production requires MEDIA_DRIVER=s3");
}

const split = (value) => (value || "").split(",").map((item) => item.trim()).filter(Boolean);

module.exports = {
  env: environment,
  isProduction: environment === "production",
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/homes_development",
  corsOrigins: split(process.env.CORS_ORIGINS),
  accessSecret: process.env.JWT_ACCESS_SECRET || "development-access-secret-change-before-production",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "development-refresh-secret-change-before-production",
  accessTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  logLevel: process.env.LOG_LEVEL || "info",
  mediaDriver: process.env.MEDIA_DRIVER || "local",
  mediaPublicUrl: process.env.MEDIA_PUBLIC_URL || "http://localhost:3000/media",
  mediaLocalPath: path.resolve(process.cwd(), process.env.MEDIA_LOCAL_PATH || "uploads"),
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    publicUrl: process.env.S3_PUBLIC_URL,
  },
};
