process.env.NODE_ENV = "test";
process.env.ENV_FILE = "/tmp/no-media-operations-env";
process.env.LOG_LEVEL = "silent";
process.env.JWT_ACCESS_SECRET = "media-operations-secret-at-least-32";
process.env.JWT_REFRESH_SECRET = "media-operations-refresh-at-least-32";
process.env.MEDIA_LOCAL_PATH = "/tmp/dnb-media-operations-test";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  request = require("supertest"),
  jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const {
  connectDatabase,
  disconnectDatabase,
} = require("../src/config/database");
const { createApp } = require("../src/app");
const Admin = require("../src/modules/auth/admin.model"),
  Grant = require("../src/modules/media/upload-grant.model"),
  Asset = require("../src/modules/media/media-asset.model"),
  service = require("../src/modules/media/media.service");
const { AppError } = require("../src/utils/errors");
let mongo, app, admin, token;
const origin = "http://localhost:3002";
const jpeg = Buffer.from([255, 216, 255, 217]);
const issue = () =>
  request(app)
    .post("/api/v1/admin/media/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ origin });
const upload = (grant, from = origin, bytes = jpeg) =>
  request(app)
    .post("/api/v1/media/uploads")
    .set("Origin", from)
    .set("X-Media-Upload-Token", grant)
    .attach("files", bytes, { filename: "qa.jpg", contentType: "image/jpeg" });
test.before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
  await connectDatabase(mongo.getUri());
  app = createApp();
  admin = await Admin.create({
    name: "Media QA",
    email: "media@example.test",
    passwordHash: "fixture",
    role: "admin",
  });
  token = jwt.sign({ tokenVersion: 0 }, process.env.JWT_ACCESS_SECRET, {
    subject: admin.id,
    issuer: "homes-api",
    audience: "homes-admin",
    expiresIn: "10m",
  });
});
test.after(async () => {
  await disconnectDatabase();
  await mongo.stop();
});
test("valid single-use ticket accepts JPEG and persists a registered asset", async () => {
  const grant = await issue();
  assert.equal(grant.status, 201);
  assert.ok(new Date(grant.body.data.expiresAt) - Date.now() <= 120000);
  const response = await upload(grant.body.data.token);
  assert.equal(response.status, 201);
  assert.equal(response.body.data.length, 1);
  assert.equal(
    await Asset.countDocuments({ _id: response.body.data[0]._id }),
    1,
  );
  assert.equal((await upload(grant.body.data.token)).status, 401);
  await service.remove(response.body.data[0]._id);
  assert.equal(
    (await Asset.findById(response.body.data[0]._id)).status,
    "deleted",
  );
});
test("wrong origin does not consume a grant, expiry is diagnosed safely, missing grants are rejected", async () => {
  const g = await issue();
  assert.equal(
    (await upload(g.body.data.token, "http://wrong-origin.test")).status,
    401,
  );
  assert.equal((await upload(g.body.data.token)).status, 201);
  const expired = await issue();
  await Grant.updateOne(
    {
      tokenHash: require("crypto")
        .createHash("sha256")
        .update(expired.body.data.token)
        .digest("hex"),
    },
    { $set: { expiresAt: new Date(0) } },
  );
  const response = await upload(expired.body.data.token);
  assert.equal(response.status, 401);
  assert.ok(
    ["UPLOAD_AUTH_EXPIRED", "UPLOAD_AUTH_UNAVAILABLE"].includes(
      response.body.error.code,
    ),
  );
  assert.equal((await upload("bad")).status, 401);
});
test("invalid JPEG contents are refused; storage outages return safe 503 without leaking internals", async () => {
  let g = await issue();
  assert.equal(
    (await upload(g.body.data.token, origin, Buffer.from("not-a-jpeg"))).status,
    400,
  );
  g = await issue();
  const original = service.upload;
  service.upload = async () => {
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "Media storage is temporarily unavailable. Please try again.",
    );
  };
  try {
    const response = await upload(g.body.data.token);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "STORAGE_UNAVAILABLE");
    assert.ok(!JSON.stringify(response.body).includes("stack"));
  } finally {
    service.upload = original;
  }
});
test("hosted ephemeral uploads fail closed and health exposes no credentials", () => {
  assert.throws(
    () => service.assertUploadStorage({ env: "staging", mediaDriver: "local" }),
    (e) => e.code === "STORAGE_NOT_DURABLE" && e.status === 503,
  );
  assert.throws(
    () =>
      service.assertUploadStorage({ env: "production", mediaDriver: "local" }),
    (e) => e.code === "STORAGE_NOT_DURABLE",
  );
  const health = service.health();
  assert.equal(health.accessKeyId, undefined);
  assert.equal(health.secretAccessKey, undefined);
});
