const path = require('node:path');
require('dotenv').config({ path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env') });
const { requirePreviewDatabase, seedPreview } = require('./lib/preview-inventory');

async function main() {
  const uri = requirePreviewDatabase(process.env, process.argv.slice(2));
  const mongoose = require('mongoose');
  try {
    await mongoose.connect(uri, { dbName: 'homes_preview', serverSelectionTimeoutMS: 10000 });
    const Property = require('../src/modules/properties/property.model');
    const result = await seedPreview(Property, process.env, process.argv.slice(2));
    console.log(`Created: ${result.created}\nUpdated: ${result.updated}\nRemoved obsolete preview records: ${result.removed}\nTotal preview listings: ${result.total}`);
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => {
  // Driver errors can contain credentials/hosts. Only our known refusal messages are printable.
  const safe = /^(Preview seed requires|Connected database must|Preview slug collides|Preview inventory|Preview media|Preview slugs|Invalid preview inventory|Expected exactly)/.test(error.message);
  console.error(safe ? error.message : 'Preview seed failed; check the private connection configuration.');
  process.exitCode = 1;
});
module.exports = { main };
