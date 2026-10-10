const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  consumerId: { type: String, required: true, unique: true, index: true },
  saved: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  compare: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  recent: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  notifications: { viewingUpdates: { type: Boolean, default: true }, searchAlerts: { type: Boolean, default: false } },
}, { timestamps: true });
module.exports = mongoose.model('ConsumerState', schema);
