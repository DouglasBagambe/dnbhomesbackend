const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
if(process.env.NODE_ENV && !['test','development'].includes(process.env.NODE_ENV)) throw new Error('Local QA cannot run in a hosted environment');
const port = Number(process.env.HOMES_QA_PORT || 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local QA port');
process.env.NODE_ENV='test';process.env.ENV_FILE=path.join(os.tmpdir(),'homes-no-env-file');process.env.LOG_LEVEL='silent';
process.env.CONSUMER_ACCOUNTS_ENABLED='true';process.env.CONSUMER_AUTH_SECRET=crypto.randomBytes(48).toString('base64url');
process.env.CONSUMER_AUTH_URL=`http://127.0.0.1:${port}`;process.env.CORS_ORIGINS='http://127.0.0.1:3101';process.env.CONSUMER_MAIL_DRIVER='local';
(async()=>{
 const folder=process.env.CONSUMER_MAIL_LOCAL_PATH || await fs.mkdtemp(path.join(os.tmpdir(),'homes-account-browser-'));
 await fs.mkdir(folder,{recursive:true,mode:0o700});process.env.CONSUMER_MAIL_LOCAL_PATH=folder;
 const {MongoMemoryServer}=require('mongodb-memory-server');const mongo=await MongoMemoryServer.create({binary:{version:'7.0.14'}});
 process.env.MONGO_URI=mongo.getUri('homes_local_account_qa');
 const {connectDatabase,disconnectDatabase}=require('../src/config/database');await connectDatabase(process.env.MONGO_URI);
 const Property=require('../src/modules/properties/property.model');
 const photos=['1600585154340-be6161a56a0c','1522708323590-d24dbb6b0267','1600566753086-00f18fb6b3ea','1600607687939-ce8a6c25118c','1500382017468-9049fed747ef'];
 const images=Array.from({length:20},(_,i)=>({type:'image',url:`http://127.0.0.1:3101/images/${photos[i%5]}.jpg`,alt:`Local QA image ${i+1}`}));
 const videos=Array.from({length:5},(_,i)=>({type:'video',url:`http://127.0.0.1:3101/qa/video-${i+1}.mp4`,alt:`Synthetic local QA clip ${i+1}`}));
 await Property.create({_id:'6aca1225ca3d4ce6f2209da4',title:'Media-rich family home QA — Kira',slug:'media-rich-family-home-qa-kira',description:'Clearly labelled isolated QA data. Repeated photos and synthetic videos are test assets, not genuine property footage.',purpose:'rent',type:'house',price:{amount:2500000,currency:'UGX',period:'month'},location:{country:'Uganda',district:'Wakiso',area:'Kira'},status:'published',bedrooms:3,bathrooms:2,cover:images[0],media:[...images,...videos],tags:['qa:media-heavy']});
 await Property.create(require('../test/fixtures/consumer-inventory.json'));
 if(process.env.HOMES_QA_CONTROL_PATH) {
  const adminPassword=crypto.randomBytes(24).toString('base64url');
  await require('../src/modules/auth/admin.model').create({name:'Isolated QA Admin',email:'admin@homes-local-qa.invalid',passwordHash:await require('bcryptjs').hash(adminPassword,12),role:'super_admin',status:'active'});
  await fs.writeFile(process.env.HOMES_QA_CONTROL_PATH,JSON.stringify({localOnly:true,api:`http://127.0.0.1:${port}/api/v1`,email:'admin@homes-local-qa.invalid',password:adminPassword}),{mode:0o600});
 }
 const server=require('../src/app').createApp().listen(port,'127.0.0.1',()=>console.log(`Isolated account QA API ready on loopback port ${port}; no hosted database connection.`));
 const stop=async()=>{server.close();await disconnectDatabase();await mongo.stop();process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
})().catch(error=>{console.error(error.message);process.exit(1);});
