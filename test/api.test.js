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

test("guest viewing status uses a one-time-issued 256-bit token and never reveals PII", async () => {
  const Booking = require('../src/modules/bookings/booking.model');
  const property = await Property.findOne({ status: 'published' });
  const body = { property: property.id, guestName: 'Token Guest', guestEmail: 'status@example.test', guestPhone: '+256700000001', scheduledAt: new Date(Date.now()+172800000).toISOString() };
  const created = await request(app).post('/api/v1/bookings').set('Idempotency-Key','status-security-test').send(body);
  assert.equal(created.status,201);
  const { _id: id, statusAccessToken: secret } = created.body.data;
  assert.match(secret,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(created.body.data.statusTokenHash,undefined);
  const stored = await Booking.findById(id).select('+statusTokenHash');
  assert.equal(stored.statusTokenHash,require('crypto').createHash('sha256').update(secret).digest('hex'));
  const replay = await request(app).post('/api/v1/bookings').set('Idempotency-Key','status-security-test').send(body);
  assert.equal(replay.status,200); assert.equal(replay.body.data.statusAccessToken,undefined); assert.equal(replay.body.data.guestEmail,undefined);
  for (const secretValue of [undefined,'wrong','a'.repeat(43)]) {
    const r=request(app).get(`/api/v1/bookings/${id}/status`);
    if(secretValue)r.set('X-Viewing-Token',secretValue);
    assert.equal((await r).status,404);
  }
  assert.equal((await request(app).get('/api/v1/bookings/000000000000000000000000/status').set('X-Viewing-Token',secret)).status,404);
  const other = await request(app).post('/api/v1/bookings').set('Idempotency-Key','other-status-security-test').send({...body,guestEmail:'other-owner@example.test'});
  assert.equal((await request(app).get(`/api/v1/bookings/${other.body.data._id}/status`).set('X-Viewing-Token',secret)).status,404);
  await Booking.updateOne({_id:other.body.data._id},{$unset:{statusTokenHash:1}});
  assert.equal((await request(app).get(`/api/v1/bookings/${other.body.data.reference}/status`).set('X-Viewing-Token',other.body.data.statusAccessToken)).status,404);
  for(const status of ['pending','confirmed','rejected','cancelled','completed','no_show']) {
    const admin = await request(app).patch(`/api/v1/admin/bookings/${id}/status`).set('Authorization',`Bearer ${token}`).send({status,adminNotes:'Never public'});
    assert.equal(admin.status,200);
    const response=await request(app).get(`/api/v1/bookings/${created.body.data.reference}/status`).set('X-Viewing-Token',secret);
    assert.equal(response.status,200);assert.equal(response.body.data.status,status);
    assert.deepEqual(Object.keys(response.body.data).sort(),['reference','scheduledAt','status','updatedAt']);
    assert.equal(response.headers['cache-control'],'no-store');
  }
});
test("property validation accepts 25 mixed items and rejects excess or video covers", async () => {
  const {validateProperty}=require('../src/modules/properties/property.validation');
  const media=Array.from({length:25},(_,i)=>({type:i<20?'image':'video',url:`https://media.example.test/${i}`}));
  assert.doesNotThrow(()=>validateProperty({media,cover:media[0]},true));
  assert.throws(()=>validateProperty({media:Array(41).fill(media[0])},true));
  assert.throws(()=>validateProperty({cover:media[20]},true));
  assert.throws(()=>validateProperty({media:[{type:'image',url:'javascript:alert(1)'}]},true));
});
test('direct upload grants require Admin, expire, bind origin and cannot be replayed',async()=>{
  const Grant=require('../src/modules/media/upload-grant.model');
  const origin='http://localhost:3001';
  assert.equal((await request(app).post('/api/v1/admin/media/tickets').send({origin})).status,401);
  const issued=await request(app).post('/api/v1/admin/media/tickets').set('Authorization',`Bearer ${token}`).send({origin});
  assert.equal(issued.status,201);const secret=issued.body.data.token;assert.match(secret,/^[A-Za-z0-9_-]{43}$/);
  assert.equal((await request(app).post('/api/v1/media/uploads').set('Origin',origin).attach('files',Buffer.from('test'),{filename:'test.jpg',contentType:'image/jpeg'})).status,401);
  assert.equal((await request(app).post('/api/v1/media/uploads').set('Origin','http://127.0.0.1:3001').set('X-Media-Upload-Token',secret)).status,401);
  const uploaded=await request(app).post('/api/v1/media/uploads').set('Origin',origin).set('X-Media-Upload-Token',secret).attach('files',Buffer.from('test'),{filename:'test.jpg',contentType:'image/jpeg'});
  assert.equal(uploaded.status,201);assert.equal(uploaded.body.data.length,1);
  assert.equal((await request(app).post('/api/v1/media/uploads').set('Origin',origin).set('X-Media-Upload-Token',secret)).status,401);
  const expired=await request(app).post('/api/v1/admin/media/tickets').set('Authorization',`Bearer ${token}`).send({origin});await Grant.updateOne({tokenHash:require('crypto').createHash('sha256').update(expired.body.data.token).digest('hex')},{expiresAt:new Date(0)});
  assert.equal((await request(app).post('/api/v1/media/uploads').set('Origin',origin).set('X-Media-Upload-Token',expired.body.data.token)).status,401);
});

test('public search requires meaningful terms, ranks titles and composes filters/pagination', async () => {
  await Property.init();
  const make = (title, area, type='house', purpose='rent', amount=1000, description='A clearly described listing') => ({title,slug:title.toLowerCase().replace(/[^a-z0-9]+/g,'-'),description,purpose,type,price:{amount,currency:'UGX',period:'month'},location:{country:'Uganda',district:'Wakiso',area},status:'published',publishedAt:new Date()});
  const inserted = await Property.insertMany([
    make('Media-rich family home QA — Kira','Kira'),
    make('Family home in Kira','Kira'),
    make('Garden apartment in Ntinda','Ntinda','apartment','rent',3000),
    make('Second apartment Ntinda','Ntinda','apartment','rent',2000),
    make('Apartment for sale in Ntinda','Ntinda','apartment','sale',4000),
    make('Apartment in Kira','Kira','apartment'),
    make('Unrelated showroom','Nansana','commercial','rent',1500,'Media rich family home QA Kira mentioned in descriptive QA text.'),
  ]);
  try {
    const search = async query => {const res=await request(app).get('/api/v1/properties').query(query);assert.equal(res.status,200,JSON.stringify(res.body));return res.body;};
    const exact=await search({q:'Media-rich family home QA — Kira'});
    assert.equal(exact.data[0]._id,String(inserted[0]._id)); assert.equal(exact.pagination.total,2);
    assert.equal((await search({q:'media rich family home QA Kira'})).data[0]._id,String(inserted[0]._id));
    const kira=await search({q:'Kira'});assert.ok(kira.data.some(p=>p.location.area==='Kira'));assert.ok(kira.data.every(p=>JSON.stringify(p).toLowerCase().includes('kira')));
    assert.equal((await search({q:'apartments Ntinda'})).pagination.total,3);
    const apartments=await search({q:'apartment Ntinda',purpose:'rent',type:'apartment'});
    assert.equal(apartments.pagination.total,2);assert.ok(apartments.data.every(p=>p.location.area==='Ntinda'&&p.type==='apartment'&&p.purpose==='rent'));
    assert.equal((await search({q:'xyzzyunfindable987'})).pagination.total,0);
    assert.equal((await search({q:'((.*))'})).pagination.total,0);
    assert.equal((await search({q:'the and in'})).pagination.total,0);
    const sorted=await search({q:'apartment Ntinda',sort:'price_asc',limit:1,page:2});
    assert.equal(sorted.data.length,1);assert.equal(sorted.data[0].price.amount,3000);assert.equal(sorted.pagination.total,3);assert.equal(sorted.pagination.pages,3);
    assert.equal((await search({q:'apartment in Ntinda',purpose:'sale'})).pagination.total,1);
  } finally { await Property.deleteMany({_id:{$in:inserted.map(p=>p._id)}}); }
});

test('uploads enforce file count/type/size/batch limits and roll back a failed batch',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os');
  const endpoint=()=>request(app).post('/api/v1/admin/media').set('Authorization',`Bearer ${token}`);
  assert.equal((await endpoint().attach('files',Buffer.alloc(1),{filename:'bad.txt',contentType:'text/plain'})).status,400);
  let eleven=endpoint();for(let i=0;i<11;i++)eleven=eleven.attach('files',Buffer.alloc(1),{filename:`${i}.jpg`,contentType:'image/jpeg'});
  assert.equal((await eleven).status,400);
  assert.equal((await endpoint().attach('files',Buffer.alloc(10*1024*1024+1),{filename:'large.jpg',contentType:'image/jpeg'})).status,400);
  assert.equal((await endpoint().attach('files',Buffer.alloc(50*1024*1024+1),{filename:'large.webm',contentType:'video/webm'})).status,413);
  assert.equal((await endpoint().set('Content-Type','multipart/form-data; boundary=qa').set('Content-Length',String(102*1024*1024)).send('')).status,413);
  const service=require('../src/modules/media/media.service');const upload=service.upload,remove=service.remove;let calls=0,removed=[];
  service.upload=async()=>{if(++calls===2)throw Error('Deliberate QA storage failure');return {id:'batch-qa-asset'};};service.remove=async id=>{removed.push(id)};
  const before=new Set((await fs.readdir(os.tmpdir())).filter(n=>n.startsWith('homes-upload-')));
  try{const response=await endpoint().attach('files',Buffer.alloc(1),{filename:'a.jpg',contentType:'image/jpeg'}).attach('files',Buffer.alloc(1),{filename:'b.jpg',contentType:'image/jpeg'});assert.equal(response.status,500);assert.deepEqual(removed,['batch-qa-asset']);}
  finally{service.upload=upload;service.remove=remove;}
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok((await fs.readdir(os.tmpdir())).filter(n=>n.startsWith('homes-upload-')).every(n=>before.has(n)));
});


test('removing the cover selects the next image and clearing images removes stale cover', async () => {
  const service = require('../src/modules/properties/property.service');
  const original = await Property.findOne({status:'published'});
  const property = await Property.create({title:'Cover deletion QA',slug:'cover-deletion-qa',description:'Disposable local cover regression',purpose:original.purpose,type:original.type,price:original.price,location:original.location});
  const images = [{type:'image',url:'https://media.example.test/first.jpg',alt:'First'}, {type:'image',url:'https://media.example.test/second.jpg',alt:'Second'}];
  const video = {type:'video',url:'https://media.example.test/clip.webm'};
  try {
    assert.equal((await service.update(property.id,{media:images,cover:images[0]})).cover.url,images[0].url);
    assert.equal((await service.update(property.id,{media:[video,images[1]]})).cover.url,images[1].url);
    assert.equal((await service.update(property.id,{media:[video]})).cover,undefined);
    assert.equal((await service.update(property.id,{media:[]})).media.length,0);
  } finally { await Property.deleteOne({_id:property.id}); }
});
