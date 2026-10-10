const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tokenHash: {type:String,required:true,unique:true,select:false},
  actor: {type:mongoose.Schema.Types.ObjectId,ref:'Admin',required:true},
  tokenVersion: {type:Number,required:true},
  origin: {type:String,required:true},
  expiresAt: {type:Date,required:true,index:{expires:0}},
});
module.exports = mongoose.model('MediaUploadGrant',schema);
