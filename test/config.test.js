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

test('hosted consumer accounts require independent secrets, TLS mail and transactions',()=>{
 const consumer={...valid,CONSUMER_ACCOUNTS_ENABLED:'true',CONSUMER_AUTH_SECRET:'c'.repeat(64),CONSUMER_WEB_PROXY_SECRET:'d'.repeat(64),CONSUMER_AUTH_URL:'https://api.homes-fixture.co.ug',CONSUMER_MAIL_DRIVER:'smtp',SMTP_HOST:'smtp.homes-fixture.co.ug',SMTP_USER:'isolated-configuration-fixture',SMTP_PASSWORD:'isolated-configuration-fixture',CONSUMER_MAIL_FROM:'accounts@homes-fixture.co.ug'};
 assert.doesNotThrow(()=>validateEnvironment(consumer));
 for(const patch of [{CONSUMER_AUTH_SECRET:valid.JWT_ACCESS_SECRET},{CONSUMER_WEB_PROXY_SECRET:consumer.CONSUMER_AUTH_SECRET},{CONSUMER_WEB_PROXY_SECRET:''},{CONSUMER_AUTH_URL:'http://localhost:3100'},{CONSUMER_MAIL_DRIVER:'local'},{SMTP_PASSWORD:''},{SMTP_PORT:'25'},{CONSUMER_MONGO_TRANSACTIONS:'false'}]) assert.throws(()=>validateEnvironment({...consumer,...patch}));
});
test('forwarded consumer IP requires a fresh path-bound authenticated signature',()=>{
 const crypto=require('node:crypto');const {clientIp}=require('../src/modules/consumer/proxy-ip');const before=process.env.CONSUMER_WEB_PROXY_SECRET;process.env.CONSUMER_WEB_PROXY_SECRET='private-test-proxy-key'.repeat(3);
 const now=Date.now(),stamp=String(now),ip='192.0.2.55',path='/api/v1/auth/consumer/sign-in/email';
 const h={'x-homes-web-ip':ip,'x-homes-web-time':stamp,'x-homes-web-signature':crypto.createHmac('sha256',process.env.CONSUMER_WEB_PROXY_SECRET).update(['POST',path,ip,stamp].join('\n')).digest('hex')};const req={ip:'127.0.0.1',method:'POST',originalUrl:path,get:key=>h[key]};
 assert.equal(clientIp(req,now),ip);assert.equal(clientIp(req,now+31000),req.ip);assert.equal(clientIp({...req,method:'GET'},now),req.ip);assert.equal(clientIp({...req,originalUrl:path+'-forged'},now),req.ip);
 h['x-homes-web-signature']='a'.repeat(64);assert.equal(clientIp(req,now),req.ip);if(before===undefined)delete process.env.CONSUMER_WEB_PROXY_SECRET;else process.env.CONSUMER_WEB_PROXY_SECRET=before;
});
