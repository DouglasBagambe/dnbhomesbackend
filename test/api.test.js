process.env.NODE_ENV = "test"; process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-at-least-32-chars"; process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-at-least-32-chars";
const test = require("node:test"); const assert = require("node:assert/strict"); const request = require("supertest"); const { MongoMemoryServer } = require("mongodb-memory-server"); const bcrypt = require("bcryptjs"); const { createApp } = require("../src/app"); const { connectDatabase, disconnectDatabase } = require("../src/config/database"); const Admin = require("../src/modules/auth/admin.model"); const Property = require("../src/modules/properties/property.model"); const Agent = require("../src/modules/agents/agent.model"); const Agency = require("../src/modules/agents/agency.model");
let mongo; let app; let token;
test.before(async () => { mongo = await MongoMemoryServer.create({ binary: { version: "7.0.14" } }); await connectDatabase(mongo.getUri()); app = createApp(); const admin = await Admin.create({ name: "Test Admin", email: "admin@example.com", passwordHash: await bcrypt.hash("correct-horse-battery", 4), role: "super_admin" }); const login = await request(app).post("/api/v1/auth/admin/login").send({ email: admin.email, password: "correct-horse-battery" }); token = login.body.data.accessToken; });
test.after(async () => { await disconnectDatabase(); if (mongo) await mongo.stop(); });
test("health and readiness endpoints report status", async () => { assert.equal((await request(app).get("/api/v1/health")).status, 200); assert.equal((await request(app).get("/api/v1/ready")).status, 200); });
test("admin routes require authentication", async () => assert.equal((await request(app).get("/api/v1/admin/properties")).status, 401));
test("property lifecycle hides drafts and publishes listings", async () => { const payload = { title: "Kampala Home", description: "A complete listing description", purpose: "rent", type: "house", price: { amount: 1500000, currency: "UGX", period: "month" }, location: { country: "Uganda", region: "Central", district: "Kampala", area: "Ntinda", address: "Ntinda" }, bedrooms: 3, bathrooms: 2 }; const created = await request(app).post("/api/v1/admin/properties").set("Authorization", `Bearer ${token}`).send(payload); assert.equal(created.status, 201); assert.equal((await request(app).get("/api/v1/properties")).body.pagination.total, 0); const published = await request(app).post(`/api/v1/admin/properties/${created.body.data._id}/publish`).set("Authorization", `Bearer ${token}`); assert.equal(published.status, 200); const list = await request(app).get("/api/v1/properties?district=Kampala&bedrooms=2&sort=price_asc"); assert.equal(list.body.pagination.total, 1); });
test("malformed public identifiers return safe errors", async () => { const response = await request(app).get("/api/v1/properties/not-a-real-slug"); assert.equal(response.status, 404); assert.equal(response.body.error.code, "NOT_FOUND"); });
test("viewing requests create server references and remain private", async () => { const property = await Property.findOne({ status: "published" }); const response = await request(app).post("/api/v1/bookings").set("Idempotency-Key", "booking-test-1").send({ property: property.id, guestName: "Guest", guestEmail: "guest@example.com", guestPhone: "+256700000000", scheduledAt: new Date(Date.now() + 86400000).toISOString() }); assert.equal(response.status, 201); assert.match(response.body.data.reference, /^HOM-/); assert.equal((await request(app).get("/api/v1/bookings")).status, 404); assert.equal((await request(app).get("/api/v1/admin/bookings").set("Authorization", `Bearer ${token}`)).body.pagination.total, 1); });
test("public directories expose only active profiles with published listing counts", async () => { const agency = await Agency.create({ name: "Public Agency", slug: "public-agency", status: "active", verificationStatus: "verified" }); const agent = await Agent.create({ name: "Public Agent", slug: "public-agent", agency: agency.id, status: "active", verificationStatus: "verified" }); await Agent.create({ name: "Private Agent", slug: "private-agent", status: "inactive" }); await Property.updateOne({ status: "published" }, { agent: agent.id, agency: agency.id }); const agents = await request(app).get("/api/v1/agents"); assert.equal(agents.status, 200); assert.equal(agents.body.pagination.total, 1); assert.equal(agents.body.data[0].listingCount, 1); const profile = await request(app).get(`/api/v1/agents/${agent.slug}`); assert.equal(profile.status, 200); assert.equal(profile.body.data.listings.length, 1); const agencies = await request(app).get("/api/v1/agencies"); assert.equal(agencies.status, 200); assert.equal(agencies.body.data[0].listingCount, 1); assert.equal((await request(app).get("/api/v1/agents/private-agent")).status, 404); });
test("contact and listing inquiries validate, persist and remain admin-only", async () => { const contact = await request(app).post("/api/v1/contact").send({ name: "Visitor", email: "visitor@example.com", subject: "Safety question", message: "Please help me verify a listing." }); assert.equal(contact.status, 201); const listing = await request(app).post("/api/v1/listing-inquiries").send({ name: "Owner", phone: "+256700000000", role: "owner", propertyType: "house", location: "Ntinda", message: "I would like to list my house." }); assert.equal(listing.status, 201); assert.equal((await request(app).get("/api/v1/inquiries")).status, 404); const adminList = await request(app).get("/api/v1/admin/inquiries").set("Authorization", `Bearer ${token}`); assert.equal(adminList.status, 200); assert.equal(adminList.body.pagination.total, 2); const updated = await request(app).patch(`/api/v1/admin/inquiries/${listing.body.data.id}`).set("Authorization", `Bearer ${token}`).send({ status: "in_progress" }); assert.equal(updated.status, 200); assert.equal(updated.body.data.status, "in_progress"); });
test("editors cannot publish, feature or verify properties during creation", async () => {
  const editor = await Admin.create({ name: "Test Editor", email: "editor@example.com", passwordHash: await bcrypt.hash("correct-horse-battery", 4), role: "editor" });
  const login = await request(app).post("/api/v1/auth/admin/login").send({ email: editor.email, password: "correct-horse-battery" });
  const editorToken = login.body.data.accessToken;
  const payload = { title: "Editor Draft", description: "A complete editor listing description", purpose: "rent", type: "house", price: { amount: 1500000, currency: "UGX", period: "month" }, location: { country: "Uganda", district: "Kampala", area: "Ntinda" }, status: "published", featured: true, verificationStatus: "verified" };
  const created = await request(app).post("/api/v1/admin/properties").set("Authorization", `Bearer ${editorToken}`).send(payload);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, "draft");
  assert.equal(created.body.data.featured, false);
  assert.equal(created.body.data.verificationStatus, "unverified");
  assert.equal((await request(app).get(`/api/v1/properties/${created.body.data._id}`)).status, 404);
  const updated = await request(app).patch(`/api/v1/admin/properties/${created.body.data._id}`).set("Authorization", `Bearer ${editorToken}`).send({ title: "Updated Editor Draft", status: "published", featured: true, verificationStatus: "verified" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.title, "Updated Editor Draft");
  assert.equal(updated.body.data.status, "draft");
  assert.equal(updated.body.data.featured, false);
  assert.equal(updated.body.data.verificationStatus, "unverified");
  assert.equal((await request(app).post(`/api/v1/admin/properties/${created.body.data._id}/publish`).set("Authorization", `Bearer ${editorToken}`)).status, 403);
});

test("refresh tokens rotate atomically and cannot be reused", async () => {
  const login = await request(app).post("/api/v1/auth/admin/login").send({ email: "admin@example.com", password: "correct-horse-battery" });
  const responses = await Promise.all(Array.from({ length: 2 }, () => request(app).post("/api/v1/auth/admin/refresh").send({ refreshToken: login.body.data.refreshToken })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);
});
test("editors cannot read booking or inquiry PII", async () => {
  const login = await request(app).post("/api/v1/auth/admin/login").send({ email: "editor@example.com", password: "correct-horse-battery" });
  for (const path of ["bookings", "inquiries"]) assert.equal((await request(app).get(`/api/v1/admin/${path}`).set("Authorization", `Bearer ${login.body.data.accessToken}`)).status, 403);
});

test("admin password resets revoke access/refresh sessions and never expose hashes", async () => {
  const created = await request(app).post("/api/v1/admin/admins").set("Authorization", `Bearer ${token}`).send({ name: "Reset User", email: "reset@example.com", password: "correct-horse-battery", role: "editor" });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.passwordHash, undefined);
  const login = await request(app).post("/api/v1/auth/admin/login").send({ email: "reset@example.com", password: "correct-horse-battery" });
  const reset = await request(app).patch(`/api/v1/admin/admins/${created.body.data._id}`).set("Authorization", `Bearer ${token}`).send({ password: "new-password-for-reset" });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.data.passwordHash, undefined);
  assert.equal(reset.body.data.tokenVersion, undefined);
  assert.equal((await request(app).get("/api/v1/auth/admin/me").set("Authorization", `Bearer ${login.body.data.accessToken}`)).status, 401);
  assert.equal((await request(app).post("/api/v1/auth/admin/refresh").send({ refreshToken: login.body.data.refreshToken })).status, 401);
});

test("failed sign-ins are rate limited with the API JSON contract", async () => {
  let response;
  for (let attempt = 0; attempt < 11; attempt++) response = await request(app).post("/api/v1/auth/admin/login").send({ email: "missing@example.com", password: "invalid-password" });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, "RATE_LIMITED");
  assert.ok(response.headers["retry-after"]);
});
