const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEnvironment, requireDemoDatabase } = require("../src/config/validate-env");
const valid = { NODE_ENV: "production", MONGO_URI: "mongodb+srv://user:password@cluster.homes-fixture.co.ug/homes_production", JWT_ACCESS_SECRET: "a".repeat(64), JWT_REFRESH_SECRET: "b".repeat(64), CORS_ORIGINS: "https://homes-fixture.co.ug", TRUST_PROXY: "1", MEDIA_DRIVER: "s3", S3_ENDPOINT: "https://objects.homes-fixture.co.ug", S3_REGION: "auto", S3_BUCKET: "homes-fixture", S3_ACCESS_KEY_ID: "test-only", S3_SECRET_ACCESS_KEY: "test-only", S3_PUBLIC_URL: "https://media.homes-fixture.co.ug" };
test("production requires safe complete configuration before connecting", () => {
  assert.doesNotThrow(() => validateEnvironment(valid));
  for (const key of Object.keys(valid).filter((key) => key !== "NODE_ENV")) assert.throws(() => validateEnvironment({ ...valid, [key]: "" }), key);
  for (const patch of [{ JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET }, { JWT_ACCESS_SECRET: "replace-with-at-least-32-random-characters" }, { MONGO_URI: "mongodb://127.0.0.1:27018/homes_development" }, { MONGO_URI: "mongodb+srv://cluster.homes-fixture.co.ug/homes_production?tls=false" }, { MONGO_URI: "mongodb://cluster.homes-fixture.co.ug/homes_production" }, { CORS_ORIGINS: "https://homes-fixture.co.ug/path" }, { CORS_ORIGINS: " , " }, { S3_PUBLIC_URL: "https://media.example.invalid" }, { TRUST_PROXY: "true" }]) assert.throws(() => validateEnvironment({ ...valid, ...patch }));
});
test("demo seed and cleanup only permit the local development database", () => {
  assert.doesNotThrow(() => requireDemoDatabase({ NODE_ENV: "development", MONGO_URI: "mongodb://127.0.0.1:27018/homes_development" }));
  for (const values of [{ NODE_ENV: "production" }, { NODE_ENV: "staging" }, { NODE_ENV: "development", MONGO_URI: valid.MONGO_URI }, { NODE_ENV: "development", MONGO_URI: "mongodb://localhost:27018/homes_production" }]) assert.throws(() => requireDemoDatabase(values));
});
