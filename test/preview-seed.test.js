const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { requirePreviewDatabase, buildProperties, seedPreview, isTrustedPreviewImage, SEED_TAG, DISCLOSURE } = require('../scripts/lib/preview-inventory');
const Property = require('../src/modules/properties/property.model');
const values = { NODE_ENV: 'staging', MONGO_URI: 'mongodb://127.0.0.1:27017/homes_preview' };
const args = ['--confirm-preview'];

test('preview guard refuses every other environment, wrong/missing database, ambiguous URI and missing confirmation', () => {
  assert.equal(requirePreviewDatabase(values, args), values.MONGO_URI);
  for (const NODE_ENV of ['production','development','test','']) assert.throws(() => requirePreviewDatabase({ ...values, NODE_ENV }, args));
  for (const db of ['homes_development','homes_test','test','production','homes_preview_extra','']) assert.throws(() => requirePreviewDatabase({ ...values, MONGO_URI: `mongodb://127.0.0.1:27017/${db}` }, args));
  for (const MONGO_URI of [undefined,'https://example.com/homes_preview','mongodb://localhost/homes_preview?dbName=production','mongodb://localhost/%68omes_preview']) assert.throws(() => requirePreviewDatabase({ ...values, MONGO_URI }, args));
  assert.throws(() => requirePreviewDatabase(values, []));
});

test('exact category mix, Uganda locations, positive UGX prices, licensed media, unverified published status and disclosures', () => {
  const records = buildProperties();
  assert.equal(records.length, 50);
  assert.equal(new Set(records.map(r => r.slug)).size, 50);
  const counts = {};
  for (const r of records) {
    const category = r.tags[2]; counts[category] = (counts[category] || 0) + 1;
    assert.equal(r.location.country, 'Uganda'); assert.ok(r.location.district && r.location.area);
    assert.ok(r.price.amount > 0); assert.equal(r.price.currency, 'UGX');
    assert.equal(r.price.period, r.purpose === 'sale' ? 'total' : r.purpose === 'short_stay' ? 'night' : 'month');
    assert.ok(r.media.length); assert.ok(r.media.every(m => isTrustedPreviewImage(m.url)));
    assert.equal(r.verificationStatus, 'unverified'); assert.equal(r.status, 'published');
    assert.ok(r.description.endsWith(DISCLOSURE)); assert.ok(r.description.includes('Media credits'));
    assert.equal(new Property(r).validateSync(), undefined);
  }
  assert.deepEqual(counts, {'ordinary-rental':8, apartment:10,'family-house-rent':6,'residential-sale':6,land:8,commercial:4,'short-stay':4,'hotel-guest-house':2,upcountry:2});
  assert.equal(records.filter(r=>r.featured).length, 10);
});

test('preview media trust accepts only reviewed Commons files or fixed website showcase assets', () => {
  const manifest = require('../scripts/data/uganda-preview-media.json');
  const owned = 'https://dnbhomeswebsite-psi.vercel.app/images/uganda/showcase/optimized-single-room.jpg';
  assert.ok(isTrustedPreviewImage(owned));
  for (const source of manifest) {
    assert.ok(isTrustedPreviewImage(source.originalUrl));
    assert.ok(isTrustedPreviewImage(source.url));
    assert.equal(new URL(source.url).hostname, 'dnbhomeswebsite-psi.vercel.app');
    assert.equal(new URL(source.url).pathname, `/images/uganda/showcase/optimized-${source.id}.jpg`);
  }
  for (const url of ['https://example.com/photo.jpg', 'https://dnbhomesbackend.onrender.com/media/images/2026-10-09/1234-abcd.jpg', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/unreviewed.jpg', owned+'?redirect=https://example.com', owned+'#fragment', owned.replace('https:', 'http:'), owned.replace('https://', 'https://user:password@'), owned.replace('/images/uganda/showcase/', '/private/'), owned.replace('optimized-single-room.jpg', 'unreviewed.jpg'), owned.replace('.vercel.app', '.vercel.app.example.com'), owned.replace('.app/', '.app:8443/'), 'not-a-url']) assert.equal(isTrustedPreviewImage(url), false);
});

test('real Mongo rerun retains 50 IDs, preserves unrelated inventory and view counts, removes only obsolete tagged records, refuses collisions', async () => {
  const mongo = await MongoMemoryServer.create({ instance: { dbName: 'homes_preview' } });
  const env = { ...values, MONGO_URI: mongo.getUri('homes_preview') };
  try {
    await mongoose.connect(env.MONGO_URI);
    const sample = buildProperties()[0];
    const unrelated = await Property.create({ ...sample, slug: 'genuine-untouched', tags: ['genuine'], description: 'Untouched genuine property' });
    assert.deepEqual(await seedPreview(Property, env, args), { created:50, updated:0, removed:0, total:50 });
    const ids = (await Property.find({ tags:SEED_TAG }).sort({slug:1}).lean()).map(r=>String(r._id));
    await Property.updateOne({slug:sample.slug}, {$set:{viewCount:7}});
    await Property.create({ ...sample, slug:'obsolete-preview', tags:[SEED_TAG,'preview'] });
    assert.deepEqual(await seedPreview(Property, env, args), { created:0, updated:50, removed:1, total:50 });
    assert.deepEqual((await Property.find({tags:SEED_TAG}).sort({slug:1}).lean()).map(r=>String(r._id)), ids);
    assert.equal((await Property.findById(unrelated._id)).description, 'Untouched genuine property');
    assert.equal((await Property.findOne({slug:sample.slug})).viewCount, 7);
    await Property.updateOne({slug:sample.slug},{$set:{tags:['genuine']}});
    await assert.rejects(seedPreview(Property,env,args),/collides/);
    assert.equal(await Property.countDocuments({tags:SEED_TAG}),49);
    await mongoose.disconnect();
    await mongoose.connect(mongo.getUri('homes_development'));
    await assert.rejects(seedPreview(Property,env,args),/Connected database/);
    assert.equal(await Property.countDocuments(),0);
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});
