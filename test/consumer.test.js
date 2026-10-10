process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.CONSUMER_ACCOUNTS_ENABLED = 'true';
process.env.CONSUMER_AUTH_SECRET = 'isolated-consumer-test-secret-more-than-32-characters';
process.env.CONSUMER_AUTH_URL = 'http://localhost:3000';
process.env.CONSUMER_MAIL_DRIVER = 'local';
process.env.CORS_ORIGINS = 'http://localhost:3001';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const Property = require('../src/modules/properties/property.model');
const Booking = require('../src/modules/bookings/booking.model');
let app, mongo, folder, property, session;
const email = 'consumer@example.com';
const password = 'A sound and long test password!';
const authPath = '/api/v1/auth/consumer';
const send = (endpoint, body, token) => request(app).post(`${authPath}/${endpoint}`).set('Origin', 'http://localhost:3001').set('Authorization', token ? `Bearer ${token}` : '').send(body);
async function code(type, address = email) {
  const messages = await Promise.all((await fs.readdir(folder)).map(async file => JSON.parse(await fs.readFile(path.join(folder, file), 'utf8'))));
  return messages.filter(m => m.email === address && m.type === type).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)?.otp;
}
test.before(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'homes-consumer-mail-'));
  process.env.CONSUMER_MAIL_LOCAL_PATH = folder;
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  await connectDatabase(mongo.getUri()); app = createApp();
  property = await Property.create({ title: 'Account QA home', slug: 'account-qa-home', description: 'Local isolated account and viewing tests', purpose: 'rent', type: 'house', price: { amount: 1500000, currency: 'UGX', period: 'month' }, location: { country: 'Uganda', district: 'Wakiso', area: 'Kira' }, status: 'published' });
});
test.after(async () => { await disconnectDatabase(); await mongo?.stop(); await fs.rm(folder, { recursive: true, force: true }); });
test('registration requires ownership, OTP is hashed and single use, signed session is issued', async () => {
  assert.equal((await send('sign-up/email', { name: 'QA', email, password: 'weak' })).status, 400);
  const signup = await send('sign-up/email', { name: 'QA consumer', email, password, phone: '+256700000000' });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  assert.equal(signup.body.token, null);
  assert.equal((await send('sign-in/email', { email, password })).status, 403);
  const otp = await code('email-verification'); assert.match(otp, /^\d{6}$/);
  const mongoose = require('mongoose');
  const stored = await mongoose.connection.db.collection('consumerVerification').findOne({});
  assert.ok(stored); assert.ok(!stored.value.includes(otp));
  const verified = await send('email-otp/verify-email', { email, otp });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  session = decodeURIComponent(verified.headers['set-auth-token'] || '');
  assert.ok(session.includes('.'));
  assert.equal((await request(app).get('/api/v1/consumer/me').set('Authorization', `Bearer ${session}`)).status, 200);
  assert.ok((await send('email-otp/verify-email', { email, otp })).status >= 400);
  assert.equal((await request(app).get('/api/v1/consumer/me').set('Authorization', `Bearer ${session.split('.')[0]}`)).status, 401);
});
test('cross-device state is deduplicated and guest viewing claims require the actual opaque token', async () => {
  const add = await request(app).post('/api/v1/consumer/state').set('Authorization', `Bearer ${session}`).send({ collection: 'saved', action: 'add', propertyId: property.id });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  const scheduledAt = new Date(Date.now() + 86400000).toISOString();
  const guest = await request(app).post('/api/v1/bookings').send({ property: property.id, guestName: 'Guest QA', guestEmail: 'guest@example.com', guestPhone: '+256700000001', scheduledAt });
  assert.equal(guest.status, 201);
  const merge = await request(app).post('/api/v1/consumer/merge').set('Authorization', `Bearer ${session}`).send({ saved: [property.id, property.id], compare: [property.id], recent: [property.id], viewings: [{ id: guest.body.data._id, token: 'a'.repeat(43) }] });
  assert.equal(merge.status, 200, JSON.stringify(merge.body));
  assert.deepEqual(merge.body.data.saved, [property.id]); assert.deepEqual(merge.body.claimedViewings, []);
  assert.equal((await request(app).get('/api/v1/consumer/viewings').set('Authorization', `Bearer ${session}`)).body.pagination.total, 0);
  const claim = await request(app).post('/api/v1/consumer/merge').set('Authorization', `Bearer ${session}`).send({ viewings: [{ id: guest.body.data._id, token: guest.body.data.statusAccessToken }] });
  assert.equal(claim.status, 200); assert.deepEqual(claim.body.claimedViewings, [guest.body.data._id]);
  const login = await send('sign-in/email', { email, password });
  const second = decodeURIComponent(login.headers['set-auth-token']);
  const list = await request(app).get('/api/v1/consumer/viewings').set('Authorization', `Bearer ${second}`);
  assert.equal(list.body.pagination.total, 1); assert.equal(list.body.data[0].status, 'pending');
  await Booking.updateOne({ _id: guest.body.data._id }, { status: 'confirmed' });
  assert.equal((await request(app).get('/api/v1/consumer/viewings').set('Authorization', `Bearer ${second}`)).body.data[0].status, 'confirmed');
  const quick = await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${second}`).send({ property: property.id, scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(), user: 'forged', consumerId: 'forged', guestEmail: 'forged@example.com' });
  assert.equal(quick.status, 201, JSON.stringify(quick.body)); assert.equal(quick.body.data.guestEmail, email); assert.notEqual(quick.body.data.consumerId, 'forged');
  assert.equal((await request(app).post('/api/v1/bookings').send({ property: property.id, user: 'forged', scheduledAt })).status, 400);
  assert.equal((await send('sign-out', {}, second)).status, 200);
  assert.equal((await request(app).get('/api/v1/consumer/me').set('Authorization', `Bearer ${second}`)).status, 401);
});
test('owned viewing history paginates without duplicates or private contact fields', async () => {
  const profile = await request(app).get('/api/v1/consumer/me').set('Authorization', `Bearer ${session}`);
  const owner = profile.body.data.id;
  const existing = await Booking.findOne({ consumerId: owner });
  const batch = await Booking.create(Array.from({ length: 31 }, (_, i) => ({ consumerId: owner, property: existing.property, reference: `LOCAL-PAGINATION-${i}`, scheduledAt: new Date(Date.now() - (i + 1) * 86400000), guestName: 'Private QA', guestEmail: email, notes: 'Private note', adminNotes: 'Private admin note' })));
  try {
    const read = page => request(app).get(`/api/v1/consumer/viewings?page=${page}`).set('Authorization', `Bearer ${session}`);
    const first = await read(1), second = await read(2);
    assert.equal(first.status, 200); assert.equal(first.body.data.length, 30);
    assert.equal(first.body.pagination.pages, 2); assert.equal(second.body.data.length, 3);
    assert.equal(new Set([...first.body.data, ...second.body.data].map(item => item._id)).size, 33);
    for (const item of [...first.body.data, ...second.body.data]) {
      for (const key of ['guestName', 'guestEmail', 'guestPhone', 'notes', 'adminNotes', 'statusTokenHash']) assert.equal(item[key], undefined);
    }
  } finally { await Booking.deleteMany({ _id: { $in: batch.map(item => item._id) } }); }
});
test('account isolation, concurrent compare limits, expiry and origin protections', async () => {
  const alien = 'another-consumer@example.com';
  const registration = await send('sign-up/email', {name:'Another QA consumer',email:alien,password});
  assert.equal(registration.status,200);
  const verify = await send('email-otp/verify-email',{email:alien,otp:await code('email-verification',alien)});
  assert.equal(verify.status,200);
  const token = decodeURIComponent(verify.headers['set-auth-token']);
  const post = (path,body) => request(app).post(`/api/v1/consumer/${path}`).set('Authorization',`Bearer ${token}`).send(body);
  const owned = await Booking.findOne({consumerId:{$exists:true}}).select('+statusTokenHash').lean();
  const denied = await post('merge',{viewings:[{id:String(owned._id),token:'a'.repeat(43)}]});
  assert.deepEqual(denied.body.claimedViewings,[]);
  assert.equal((await request(app).get('/api/v1/consumer/viewings').set('Authorization',`Bearer ${token}`)).body.pagination.total,0);
  assert.equal((await request(app).get('/api/v1/consumer/state')).status,401);
  const houses = await Property.create([1,2,3].map(i=>({title:`Compare QA ${i}`,slug:`compare-qa-${i}`,description:'Local concurrency test property',purpose:'rent',type:'house',price:{amount:1000000,currency:'UGX',period:'month'},location:{country:'Uganda',district:'Wakiso',area:'Kira'},status:'published'})));
  const results = await Promise.all(houses.map(house=>post('state',{collection:'compare',action:'add',propertyId:house.id})));
  assert.equal(results.filter(result=>result.status===200).length,2);
  assert.equal(results.filter(result=>result.status===409).length,1);
  assert.equal((await request(app).get('/api/v1/consumer/state').set('Authorization',`Bearer ${token}`)).body.data.compare.length,2);
  const invalid = await post('merge',{saved:[houses[0].id],viewings:{invalid:true}});
  assert.equal(invalid.status,400);
  assert.deepEqual((await request(app).get('/api/v1/consumer/state').set('Authorization',`Bearer ${token}`)).body.data.saved,[]);
  const oversized = await send('sign-in/email', { email, password, extra: 'x'.repeat(40000) });
  assert.equal(oversized.status, 413);
  const origin = await request(app).post(`${authPath}/sign-in/email`).set('Origin','https://attacker.invalid').send({email,password});
  assert.equal(origin.status,403);
  const mongoose = require('mongoose');
  const expired = await mongoose.connection.db.collection('consumerSession').updateOne({token:token.split('.')[0]},{$set:{expiresAt:new Date(0)}});
  assert.equal(expired.modifiedCount,1);
  assert.equal((await request(app).get('/api/v1/consumer/me').set('Authorization',`Bearer ${token}`)).status,401);
  const leak = await request(app).get(`${authPath}/email-otp/get-verification-otp`).query({email:alien,type:'email-verification'});
  assert.equal(leak.status,404);
});
test('reset revokes every session; account deletion erases contact/state and invalidates ownership', async () => {
  const sent = await send('email-otp/request-password-reset', { email }); assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const otp = await code('forget-password'); assert.ok(otp);
  const newPassword = 'Another long secure test password!';
  const reset = await send('email-otp/reset-password', { email, otp, password: newPassword });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await request(app).get('/api/v1/consumer/me').set('Authorization', `Bearer ${session}`)).status, 401);
  const login = await send('sign-in/email', { email, password: newPassword }); assert.equal(login.status, 200);
  const current = decodeURIComponent(login.headers['set-auth-token']);
  const removed = await send('delete-user', { password: newPassword }, current);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal((await request(app).get('/api/v1/consumer/me').set('Authorization', `Bearer ${current}`)).status, 401);
  const item = await Booking.findOne({ guestName: 'Deleted account' }); assert.ok(item); assert.equal(item.guestEmail, ''); assert.equal(item.consumerId, undefined);
});

test('brute force is bounded and a spoofed client IP cannot evade the limiter', async () => {
  let last;
  for(let i=0;i<12;i++) last=await request(app).post(`${authPath}/sign-in/email`).set('Origin','http://localhost:3001').set('x-homes-client-ip',`192.0.2.${i+1}`).send({email:'absent@example.com',password:'An incorrect but long password!'});
  assert.equal(last.status,429);
  assert.ok(last.headers['x-retry-after']);
});
