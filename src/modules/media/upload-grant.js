const crypto=require('node:crypto');const Grant=require('./upload-grant.model');const Admin=require('../auth/admin.model');const {AppError}=require('../../utils/errors');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
async function issue(admin,origin) {
  let url;try{url=new URL(origin)}catch{throw new AppError(400,'INVALID_ORIGIN','A valid upload origin is required')}
  if(url.origin!==origin||!['http:','https:'].includes(url.protocol))throw new AppError(400,'INVALID_ORIGIN','A valid upload origin is required');
  const token=crypto.randomBytes(32).toString('base64url');
  const actor=await Admin.findById(admin.id).select('+tokenVersion');
  if(!actor||actor.status!=='active')throw new AppError(401,'UNAUTHORIZED','Authentication required');
  const expiresAt=new Date(Date.now()+120000);
  await Grant.create({tokenHash:digest(token),actor:actor.id,tokenVersion:actor.tokenVersion,origin,expiresAt});
  return {token,expiresAt,maxFiles:10,maxBatchBytes:100*1024*1024};
}
async function authorize(req,res,next) {
  try {
    const token=req.get('X-Media-Upload-Token');
    if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AppError(401,'UNAUTHORIZED','Upload authorization unavailable');
    // Atomic consumption prevents replay; origin binds the grant to the same-origin Admin request.
    const grant=await Grant.findOneAndDelete({tokenHash:digest(token),origin:req.get('origin'),expiresAt:{$gt:new Date()}});
    if(!grant)throw new AppError(401,'UNAUTHORIZED','Upload authorization unavailable');
    const actor=await Admin.findById(grant.actor).select('+tokenVersion');
    if(!actor||actor.status!=='active'||actor.tokenVersion!==grant.tokenVersion)throw new AppError(401,'UNAUTHORIZED','Upload authorization unavailable');
    req.admin=actor;next();
  }catch(error){next(error)}
}
module.exports={issue,authorize};
