process.env.NODE_ENV = "test";
process.env.ENV_FILE = "/tmp/no-admin-operations-env";
process.env.LOG_LEVEL = "silent";
process.env.JWT_ACCESS_SECRET = "isolated-operations-test-secret-32-chars";
process.env.JWT_REFRESH_SECRET = "isolated-operations-refresh-secret-32";
process.env.MEDIA_LOCAL_PATH = "/tmp/dnb-operations-test-media";
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
  Property = require("../src/modules/properties/property.model"),
  Agent = require("../src/modules/agents/agent.model"),
  Agency = require("../src/modules/agents/agency.model"),
  Booking = require("../src/modules/bookings/booking.model"),
  Event = require("../src/modules/audit/audit-event.model"),
  Asset = require("../src/modules/media/media-asset.model");
let mongo, app, users, tokens;
const make = (title = "Operations property") => ({
  title,
  description: "Isolated operations property fixture",
  purpose: "rent",
  type: "house",
  price: { amount: 1000, currency: "UGX", period: "month" },
  location: { country: "Uganda", district: "Kampala", area: "Ntinda" },
});
const endpoint = (role, method, path, body) =>
  request(app)
    [method]("/api/v1/admin" + path)
    .set("Authorization", `Bearer ${tokens[role]}`)
    .send(body);
test.before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
  await connectDatabase(mongo.getUri());
});
test.beforeEach(async () => {
  for (const model of Object.values(require("mongoose").models))
    await model.deleteMany({});
  app = createApp();
  users = {};
  tokens = {};
  for (const role of ["super_admin", "admin", "editor"]) {
    users[role] = await Admin.create({
      name: role,
      email: role + "@example.test",
      passwordHash: "not-used-by-direct-token-fixture",
      role,
    });
    tokens[role] = jwt.sign(
      { tokenVersion: 0 },
      process.env.JWT_ACCESS_SECRET,
      {
        subject: users[role].id,
        issuer: "homes-api",
        audience: "homes-admin",
        expiresIn: "10m",
      },
    );
  }
});
test.after(async () => {
  await disconnectDatabase();
  await mongo.stop();
});
test("permanent delete is super-admin-only, requires both confirmations, preserves viewing history and audits once", async () => {
  const created = await endpoint("admin", "post", "/properties", make());
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  const booking = await Booking.create({
    reference: "DELETE-HISTORY",
    property: id,
    guestName: "Historical requester",
    guestEmail: "history@example.test",
    scheduledAt: new Date(),
    adminNotes: "Retain this note",
  });
  for (const role of ["admin", "editor"])
    assert.equal(
      (
        await endpoint(role, "delete", `/properties/${id}`, {
          confirmation: "DELETE",
          confirmed: true,
        })
      ).status,
      403,
    );
  for (const body of [
    { confirmation: "wrong", confirmed: true },
    { confirmation: "DELETE" },
    { confirmed: true },
  ])
    assert.equal(
      (await endpoint("super_admin", "delete", `/properties/${id}`, body))
        .status,
      400,
    );
  const dependencies = await endpoint(
    "super_admin",
    "get",
    `/properties/${id}/dependencies`,
  );
  assert.equal(dependencies.body.data.viewings, 1);
  const deleted = await endpoint("super_admin", "delete", `/properties/${id}`, {
    confirmation: make().title,
    confirmed: true,
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.equal(await Property.findById(id), null);
  const retained = await Booking.findById(booking.id);
  assert.equal(retained.adminNotes, "Retain this note");
  assert.equal(retained.guestEmail, "history@example.test");
  assert.equal(retained.propertySnapshot.title, make().title);
  assert.equal(retained.propertySnapshot.deleted, true);
  assert.equal(
    (await request(app).get("/api/v1/properties/" + id)).status,
    404,
  );
  assert.equal(
    (
      await endpoint("super_admin", "delete", `/properties/${id}`, {
        confirmation: "DELETE",
        confirmed: true,
      })
    ).status,
    200,
  );
  const events = await Event.find({ action: "property.delete", entityId: id });
  assert.equal(events.length, 1);
  assert.equal(events[0].metadata.title, make().title);
  assert.equal(String(events[0].actor), users.super_admin.id);
});
test("deletion cleans owned media, retains shared assets and retries failed cleanup idempotently", async () => {
  const media = require("../src/modules/media/media.service");
  const file = {
    buffer: Buffer.from([255, 216, 255, 217]),
    size: 4,
    mimetype: "image/jpeg",
    originalname: "qa.jpg",
  };
  const owned = await media.upload(file, users.super_admin.id),
    shared = await media.upload(file, users.super_admin.id);
  const property = await Property.create({
    ...make("Media delete"),
    slug: "media-delete",
    media: [owned, shared].map((a) => ({
      key: a.key,
      url: a.url,
      type: "image",
    })),
  });
  await Property.create({
    ...make("Shared owner"),
    slug: "shared-owner",
    cover: { key: shared.key, url: shared.url, type: "image" },
  });
  const remove = media.remove;
  media.remove = async (id) => {
    if (String(id) === owned.id) throw Error("synthetic storage outage");
    return remove(id);
  };
  try {
    const result = await endpoint(
      "super_admin",
      "delete",
      `/properties/${property.id}`,
      { confirmation: "DELETE", confirmed: true },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.data.cleanupPending, 1);
    assert.equal(result.body.data.sharedMediaRetained, 1);
  } finally {
    media.remove = remove;
  }
  assert.equal((await Asset.findById(shared.id)).status, "active");
  const retried = await endpoint(
    "super_admin",
    "delete",
    `/properties/${property.id}`,
    { confirmation: "DELETE", confirmed: true },
  );
  assert.equal(retried.body.data.cleanupPending, 0);
  assert.equal((await Asset.findById(owned.id)).status, "deleted");
  assert.equal((await Asset.findById(shared.id)).status, "active");
});
test("assignment autofills matching agency, rejects mismatches and new inactive assignments", async () => {
  const a = await Agency.create({ name: "Agency X", slug: "agency-x" }),
    b = await Agency.create({ name: "Agency Y", slug: "agency-y" });
  const agent = await Agent.create({
    name: "Agent X",
    slug: "agent-x",
    agency: a.id,
  });
  assert.equal(
    (
      await endpoint("admin", "post", "/properties", {
        ...make(),
        agent: agent.id,
        agency: b.id,
      })
    ).status,
    400,
  );
  const good = await endpoint("admin", "post", "/properties", {
    ...make(),
    agent: agent.id,
  });
  assert.equal(good.status, 201);
  assert.equal(good.body.data.agency, a.id);
  await Agent.updateOne({ _id: agent.id }, { $set: { status: "inactive" } });
  assert.equal(
    (
      await endpoint("admin", "post", "/properties", {
        ...make(),
        agent: agent.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await endpoint("admin", "patch", "/properties/" + good.body.data._id, {
        description: "Existing inactive assignment remains editable",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await endpoint(
        "admin",
        "post",
        "/properties/" + good.body.data._id + "/publish",
        {},
      )
    ).status,
    400,
  );
  await Agency.updateOne({ _id: b.id }, { $set: { status: "inactive" } });
  assert.equal(
    (
      await endpoint("admin", "post", "/properties", {
        ...make(),
        agency: b.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await endpoint("admin", "patch", "/agents/" + agent.id, {
        name: agent.name,
        agency: b.id,
      })
    ).status,
    400,
  );
});
test("changing an assigned agent agency is refused until affected properties are reassigned", async () => {
  const a = await Agency.create({ name: "First", slug: "first" }),
    b = await Agency.create({ name: "Second", slug: "second" }),
    agent = await Agent.create({
      name: "Assigned",
      slug: "assigned",
      agency: a.id,
    });
  await endpoint("admin", "post", "/properties", {
    ...make(),
    agent: agent.id,
    agency: a.id,
  });
  assert.equal(
    (
      await endpoint("admin", "patch", "/agents/" + agent.id, {
        name: agent.name,
        agency: b.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await endpoint("admin", "patch", "/agents/" + agent.id, {
        name: agent.name,
        status: "inactive",
      })
    ).status,
    200,
  );
});
test("bulk actions enforce roles, exclude permanent deletion, audit successes and report partial failures", async () => {
  const p = await endpoint("admin", "post", "/properties", make());
  const id = p.body.data._id;
  for (const role of ["editor"])
    for (const action of [
      "publish",
      "archive",
      "restore",
      "verify",
      "unverify",
      "feature",
      "unfeature",
    ])
      assert.equal(
        (
          await endpoint(role, "post", "/properties/bulk", {
            ids: [id],
            action,
          })
        ).status,
        403,
      );
  assert.equal(
    (
      await endpoint("super_admin", "post", "/properties/bulk", {
        ids: [id],
        action: "delete",
      })
    ).status,
    400,
  );
  for (const action of [
    "publish",
    "archive",
    "restore",
    "verify",
    "unverify",
    "feature",
    "unfeature",
  ]) {
    const r = await endpoint("admin", "post", "/properties/bulk", {
      ids: [id, "000000000000000000000000"],
      action,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.succeeded, 1);
    assert.equal(r.body.data.failed, 1);
    assert.equal(
      await Event.countDocuments({
        action: "property.bulk." + action,
        entityId: id,
      }),
      1,
    );
  }
});
test("last active super-admin safety, role revocation and suspension token revocation are backend enforced", async () => {
  for (const body of [{ role: "admin" }, { status: "suspended" }])
    assert.equal(
      (
        await endpoint(
          "super_admin",
          "patch",
          "/admins/" + users.super_admin.id,
          body,
        )
      ).status,
      409,
    );
  assert.equal(
    (
      await endpoint("admin", "patch", "/admins/" + users.editor.id, {
        role: "admin",
      })
    ).status,
    403,
  );
  const changed = await endpoint(
    "super_admin",
    "patch",
    "/admins/" + users.editor.id,
    { role: "admin" },
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.passwordHash, undefined);
  assert.equal(changed.body.data.tokenVersion, undefined);
  assert.equal((await endpoint("editor", "get", "/properties")).status, 401);
  const suspended = await endpoint(
    "super_admin",
    "patch",
    "/admins/" + users.admin.id,
    { status: "suspended" },
  );
  assert.equal(suspended.status, 200);
  assert.equal((await endpoint("admin", "get", "/properties")).status, 401);
  assert.equal(
    (
      await endpoint("super_admin", "patch", "/admins/" + users.admin.id, {
        status: "active",
      })
    ).status,
    200,
  );
  assert.equal((await endpoint("admin", "get", "/properties")).status, 401);
});
test("concurrent super-admin suspensions cannot lock out every administrator", async () => {
  const other = await Admin.create({
    name: "Second super",
    email: "second@example.test",
    passwordHash: "fixture",
    role: "super_admin",
  });
  await Promise.all(
    [users.super_admin.id, other.id].map((id) =>
      endpoint("super_admin", "patch", "/admins/" + id, {
        status: "suspended",
      }),
    ),
  );
  assert.ok(
    (await Admin.countDocuments({ role: "super_admin", status: "active" })) >=
      1,
  );
});
test("property sorts and filters, coordinate range validation, and mutation audits are operational", async () => {
  const low = await endpoint("admin", "post", "/properties", {
    ...make("Low price"),
    price: { amount: 1 },
  });
  await endpoint("admin", "post", "/properties", {
    ...make("High price"),
    price: { amount: 9 },
  });
  const list = await endpoint(
    "admin",
    "get",
    "/properties?district=Kampala&area=Ntinda&purpose=rent&type=house&sort=price_desc",
  );
  assert.equal(list.body.pagination.total, 2);
  assert.equal(list.body.data[0].price.amount, 9);
  for (const coords of [[181, 0], [0, 91], [1], [0, 0, 0], ["1", 0]])
    assert.equal(
      (
        await endpoint("admin", "patch", "/properties/" + low.body.data._id, {
          location: {
            country: "Uganda",
            coordinates: { type: "Point", coordinates: coords },
          },
        })
      ).status,
      400,
    );
  const r = await endpoint(
    "admin",
    "patch",
    "/properties/" + low.body.data._id,
    {
      verificationStatus: "verified",
      featured: true,
      status: "published",
      location: {
        country: "Uganda",
        coordinates: { type: "Point", coordinates: [32.6, 0.3] },
      },
    },
  );
  assert.equal(r.status, 200);
  for (const action of [
    "property.publish",
    "property.verification",
    "property.feature",
  ])
    assert.equal(
      await Event.countDocuments({ entityId: low.body.data._id, action }),
      1,
    );
  const audit = await endpoint(
    "admin",
    "get",
    `/audit?actor=${users.admin.id}&action=property.verification&entityType=Property&from=2020-01-01&to=2099-01-01`,
  );
  assert.equal(audit.body.pagination.total, 1);
  assert.equal(
    (await endpoint("admin", "get", "/audit?from=not-a-date")).status,
    400,
  );
});
test("editors cannot unpublish archived or published inventory, or access operational PII and administrator controls", async () => {
  const p = await endpoint("admin", "post", "/properties", {
    ...make(),
    status: "published",
  });
  const edited = await endpoint(
    "editor",
    "patch",
    "/properties/" + p.body.data._id,
    {
      status: "draft",
      featured: true,
      verificationStatus: "verified",
      title: "Content edit only",
    },
  );
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.status, "published");
  assert.equal(edited.body.data.featured, false);
  assert.equal(edited.body.data.verificationStatus, "unverified");
  for (const path of ["/bookings", "/inquiries", "/audit", "/admins"])
    assert.equal((await endpoint("editor", "get", path)).status, 403);
  const overview = await endpoint("editor", "get", "/dashboard");
  assert.equal(overview.body.data.pendingBookings, undefined);
  assert.equal(overview.body.data.newInquiries, undefined);
});

test("availability stays separate from publication, is validated, role protected and audited", async () => {
  const created = await endpoint("admin", "post", "/properties", { ...make(), status: "published", availabilityStatus: "available" });
  const id = created.body.data._id;
  for (const value of [null, "", "unknown", ["sold"], { value: "sold" }]) {
    assert.equal((await endpoint("admin", "patch", `/properties/${id}`, { availabilityStatus: value })).status, 400);
  }
  await endpoint("editor", "patch", `/properties/${id}`, { availabilityStatus: "sold" });
  assert.equal((await Property.findById(id)).availabilityStatus, "available");
  const response = await endpoint("admin", "patch", `/properties/${id}`, { availabilityStatus: "rented", availabilityVisibleUntil: "2099-01-01" });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, "published");
  assert.equal(+new Date(response.body.data.availabilityVisibleUntil) - +new Date(response.body.data.availabilityChangedAt), 14 * 86400000);
  assert.equal(await Event.countDocuments({ entityId: id, action: "property.availability" }), 1);
  const deadline = response.body.data.availabilityVisibleUntil;
  const edited = await endpoint("admin", "patch", `/properties/${id}`, { title: "Edited without resetting expiry", availabilityStatus: "rented" });
  assert.equal(edited.body.data.availabilityVisibleUntil, deadline);
  const reopened = await endpoint("admin", "patch", `/properties/${id}`, { availabilityStatus: "available" });
  assert.equal(reopened.body.data.availabilityVisibleUntil, undefined);
});

test("rented and sold listings are public during the 14-day window, then hidden in list/search/detail while retained in Admin", async () => {
  for (const availabilityStatus of ["rented", "sold"]) {
    const created = await endpoint("admin", "post", "/properties", { ...make(`Window ${availabilityStatus}`), status: "published", availabilityStatus });
    const id = created.body.data._id;
    assert.equal((await request(app).get(`/api/v1/properties/${id}`)).status, 200);
    let list = await request(app).get("/api/v1/properties");
    assert.ok(list.body.data.some((p) => p._id === id));
    await Property.collection.updateOne({ _id: new (require("mongoose").Types.ObjectId)(id) }, { $set: { availabilityVisibleUntil: new Date(Date.now() - 1) } });
    assert.equal((await request(app).get(`/api/v1/properties/${id}`)).status, 404);
    assert.equal((await request(app).get(`/api/v1/properties/${created.body.data.slug}`)).status, 404);
    list = await request(app).get("/api/v1/properties");
    assert.ok(!list.body.data.some((p) => p._id === id));
    const searched = await request(app).get("/api/v1/properties?q=Window");
    assert.ok(!searched.body.data.some((p) => p._id === id));
    const retained = await endpoint("admin", "get", `/properties/${id}`);
    assert.equal(retained.status, 200);
    assert.equal(retained.body.data.status, "published");
    assert.equal(retained.body.data.availabilityStatus, availabilityStatus);
    const filtered = await endpoint("admin", "get", `/properties?availabilityStatus=${availabilityStatus}`);
    assert.ok(filtered.body.data.some((p) => p._id === id));
  }
});

test("viewing requests reject nonavailable inventory; legacy listings and idempotent existing requests remain usable", async () => {
  for (const availabilityStatus of [undefined, "available", "reserved", "rented", "sold", "unavailable"]) {
    const created = await endpoint("admin", "post", "/properties", { ...make(`Viewing ${availabilityStatus}`), status: "published", ...(availabilityStatus ? { availabilityStatus } : {}) });
    const id = created.body.data._id;
    const body = { property: id, guestName: "Availability QA", guestEmail: "availability@example.test", guestPhone: "+256700000000", scheduledAt: new Date(Date.now() + 86400000).toISOString() };
    const response = await request(app).post("/api/v1/bookings").set("Idempotency-Key", `availability-${id}`).send(body);
    assert.equal(response.status, !availabilityStatus || availabilityStatus === "available" ? 201 : 409);
    if (response.status === 201) {
      await endpoint("admin", "patch", `/properties/${id}`, { availabilityStatus: "rented" });
      const replay = await request(app).post("/api/v1/bookings").set("Idempotency-Key", `availability-${id}`).send(body);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.data._id, response.body.data._id);
    }
  }
  assert.equal(await Booking.countDocuments({ guestEmail: "availability@example.test" }), 2);
});
