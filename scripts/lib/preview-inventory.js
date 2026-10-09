const inventory = require('../data/uganda-preview-properties.json');
const mediaManifest = require('../data/uganda-preview-media.json');
const SEED_TAG = 'preview:uganda-showcase';
const DISCLOSURE = 'Showcase listing for Homes preview. Property availability and exact details must be confirmed before viewing.';
const reviewedCommonsImages = new Set(mediaManifest.map(source => new URL(source.originalUrl).href));
const showcasePaths = new Set(mediaManifest.map(source => `/images/uganda/showcase/optimized-${source.id}.jpg`));

function isTrustedPreviewImage(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false;
  return (url.hostname === 'upload.wikimedia.org' && url.pathname.startsWith('/wikipedia/commons/') && reviewedCommonsImages.has(url.href)) ||
    (url.hostname === 'dnbhomeswebsite-psi.vercel.app' && showcasePaths.has(url.pathname));
}

function requirePreviewDatabase(values, args) {
  if (values.NODE_ENV !== 'staging') throw new Error('Preview seed requires NODE_ENV=staging');
  if (!args.includes('--confirm-preview')) throw new Error('Preview seed requires --confirm-preview');
  let uri;
  try { uri = new URL(values.MONGO_URI); } catch { throw new Error('Preview seed requires an explicit homes_preview Mongo URI'); }
  if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol) || uri.pathname !== '/homes_preview' || [...uri.searchParams.keys()].some(key => key.toLowerCase() === 'dbname')) {
    throw new Error('Preview seed requires exactly the homes_preview database');
  }
  return values.MONGO_URI;
}

function buildProperties() {
  const byId = new Map(mediaManifest.map(item => [item.id, item]));
  if (inventory.length !== 50) throw new Error('Preview inventory must contain exactly 50 listings');
  return inventory.map((item, index) => {
    const { category, mediaIds, paragraphs, ...fields } = item;
    const images = mediaIds.map(id => {
      const source = byId.get(id);
      if (!source || !source.author || !source.licenseUrl || !/^CC BY(?:-SA)? (?:2\.0|3\.0|4\.0)$/.test(source.license)) throw new Error('Preview media requires reviewed reusable licensing');
      if (!isTrustedPreviewImage(source.url)) throw new Error('Preview media must use reviewed Commons or preview-owned images');
      return source;
    });
    const media = images.map(source => ({ url: source.url, type: 'image', alt: `Illustrative Uganda photograph: ${source.title}. Not the exact showcase property.` }));
    const credit = images.map(source => `${source.title} — ${source.author}, ${source.license} (${source.licenseUrl}); source: ${source.sourceUrl}`).join('\n');
    return { ...fields,
      description: [...paragraphs, `Illustrative Uganda imagery; these photographs do not depict this exact listing. Media credits (displayed resized/cropped):\n${credit}`, DISCLOSURE].join('\n\n'),
      media, cover: media[0], tags: [SEED_TAG, 'preview', category],
      status: 'published', verificationStatus: 'unverified',
      publishedAt: new Date(Date.UTC(2026, 9, 1, 12) + (50 - index) * 60000),
    };
  });
}

async function seedPreview(Property, values, args) {
  requirePreviewDatabase(values, args);
  if (Property.db.name !== 'homes_preview') throw new Error('Connected database must be homes_preview');
  const records = buildProperties();
  const slugs = records.map(record => record.slug);
  if (new Set(slugs).size !== 50) throw new Error('Preview slugs must be unique');
  for (const record of records) {
    require('../../src/modules/properties/property.validation').validateProperty(record);
    const error = new Property(record).validateSync();
    if (error) throw new Error('Preview inventory failed model validation');
    if (record.price.amount <= 0 || record.location.country !== 'Uganda' || !record.media.length) throw new Error('Invalid preview inventory');
  }
  await Property.init();
  if (await Property.exists({ slug: { $in: slugs }, tags: { $ne: SEED_TAG } })) throw new Error('Preview slug collides with unrelated inventory; no records changed');
  const result = await Property.bulkWrite(records.map(record => ({ updateOne: {
    filter: { slug: record.slug, tags: SEED_TAG }, update: { $set: record }, upsert: true,
  } })));
  const removed = await Property.deleteMany({ tags: SEED_TAG, slug: { $nin: slugs } });
  const total = await Property.countDocuments({ tags: SEED_TAG });
  if (total !== 50) throw new Error('Expected exactly 50 preview listings');
  return { created: result.upsertedCount, updated: result.matchedCount, removed: removed.deletedCount, total };
}
module.exports = { requirePreviewDatabase, buildProperties, seedPreview, isTrustedPreviewImage, SEED_TAG, DISCLOSURE };
