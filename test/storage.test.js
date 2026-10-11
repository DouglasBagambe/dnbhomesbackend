const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStorage, validateMedia } = require('../src/modules/media/storage');
const key = 'images/2026-10-11/12345678-1234-1234-1234-123456789012.jpg';
const config = { env: 'production', mediaDriver: 's3', s3: { endpoint: 'https://objects.homes-fixture.co.ug', bucket: 'fixture', accessKeyId: 'fixture', secretAccessKey: 'fixture', publicUrl: 'https://media.homes-fixture.co.ug', region: 'auto' } };
test('durable uploads use unique caller key, MIME/cache headers and survive adapter recreation', async () => {
  const objects = new Map(), commands = [];
  const client = { send: async command => { commands.push(command); if (command.constructor.name === 'PutObjectCommand') objects.set(command.input.Key, command.input.Body); else objects.delete(command.input.Key); } };
  const url = await createStorage(config, client).put(key, Buffer.from('isolated storage bytes'), 'image/jpeg');
  assert.equal(url, `${config.s3.publicUrl}/${key}`); assert.equal(commands[0].input.ContentType, 'image/jpeg'); assert.match(commands[0].input.CacheControl, /immutable/);
  const restarted = createStorage(config, client); assert.ok(objects.has(key)); await restarted.remove(key); assert.equal(objects.size, 0); assert.equal(commands[1].input.Bucket, 'fixture');
});
test('storage failures are sanitized, unsafe keys rejected, production never falls back', async () => {
  const store = createStorage(config, { send: async () => { throw Error('private credential'); } });
  await assert.rejects(store.put(key, Buffer.from('x'), 'image/jpeg'), error => error.code === 'STORAGE_UNAVAILABLE' && !error.message.includes('credential'));
  await assert.rejects(store.remove('../other-bucket'), /Invalid media object key/);
  assert.throws(() => createStorage({ ...config, mediaDriver: 'local' }), /ephemeral/);
  assert.throws(() => createStorage({ ...config, s3: {} }), /incomplete/);
});
test('development filesystem persists across adapters and deletes only bounded keys', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'homes-storage-test-'));
  const local = { env: 'test', mediaDriver: 'local', mediaLocalPath: folder, mediaPublicUrl: 'http://localhost/media' };
  try { await createStorage(local).put(key, Buffer.from('x'), 'image/jpeg'); assert.equal((await fs.readFile(path.join(folder,key))).toString(), 'x'); await createStorage(local).remove(key); await assert.rejects(fs.stat(path.join(folder,key))); }
  finally { await fs.rm(folder, { recursive: true, force: true }); }
});
test('media validates actual signatures and limits, not browser MIME claims', () => {
  const jpeg = Buffer.from([255,216,255,217]);
  assert.doesNotThrow(() => validateMedia({ buffer: jpeg, size: 4, mimetype: 'image/jpeg' }));
  assert.throws(() => validateMedia({ buffer: Buffer.from('<script>'), size: 8, mimetype: 'image/jpeg' }), /content/);
  assert.throws(() => validateMedia({ buffer: jpeg, size: 99, mimetype: 'image/jpeg' }), /content/);
});
test('real AWS SDK talks to an isolated S3-compatible server across restart and delete', async () => {
  const http = require('node:http');
  const objects = new Map();
  const server = http.createServer(async (req,res) => {
    assert.match(req.headers.authorization || '', /^AWS4-HMAC-SHA256 /);
    if (req.method === 'PUT') { const chunks=[]; for await (const chunk of req) chunks.push(chunk); objects.set(new URL(req.url,'http://localhost').pathname, Buffer.concat(chunks)); res.writeHead(200, { ETag:'"fixture"' }).end(); }
    else if (req.method === 'DELETE') { objects.delete(new URL(req.url,'http://localhost').pathname); res.writeHead(204).end(); }
    else res.writeHead(405).end();
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const local = { ...config, env:'test', s3:{ ...config.s3, endpoint:`http://127.0.0.1:${server.address().port}` } };
  try {
    await createStorage(local).put(key, Buffer.from('durable fixture bytes'), 'image/jpeg');
    assert.equal(objects.size,1);
    assert.equal([...objects.values()][0].toString(),'durable fixture bytes');
    await createStorage(local).remove(key); assert.equal(objects.size,0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
