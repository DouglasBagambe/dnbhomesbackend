const router = require('express').Router();
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const asyncHandler = require('../../utils/async-handler');
const { badRequest, notFound, AppError } = require('../../utils/errors');
const { identity } = require('./auth');
const State = require('./state.model');
const Property = require('../properties/property.model');
const Booking = require('../bookings/booking.model');

router.use(asyncHandler(async (req, res, next) => {
  req.consumer = await identity(req); res.set('Cache-Control', 'no-store'); next();
}));
async function ensure(id) {
  try { await State.updateOne({ consumerId: id }, { $setOnInsert: { consumerId: id } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
}
const safeState = item => ({ saved: item.saved.map(String), compare: item.compare.map(String), recent: item.recent.map(String), notifications: item.notifications });
async function state(id) { await ensure(id); return safeState(await State.findOne({ consumerId: id }).lean()); }
function ids(value, max) {
  if (!Array.isArray(value) || value.length > max || value.some(id => typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id))) throw badRequest('Invalid property selections');
  return [...new Set(value)];
}
async function published(values) {
  return (await Property.find({ _id: { $in: values }, status: 'published' }).select('_id').lean()).map(p => String(p._id));
}
router.get('/me', asyncHandler(async (req, res) => {
  const { user } = req.consumer;
  res.json({ data: { id: user.id, name: user.name, email: user.email, phone: user.phone || '', emailVerified: user.emailVerified } });
}));
router.get('/state', asyncHandler(async (req, res) => res.json({ data: await state(req.consumer.user.id) })));
router.post('/state', asyncHandler(async (req, res) => {
  const { collection, action, propertyId } = req.body;
  if (!['saved', 'compare', 'recent'].includes(collection) || !['add', 'remove'].includes(action)) throw badRequest('Invalid selection operation');
  ids([propertyId], 1);
  const id = req.consumer.user.id;
  await ensure(id);
  if (action === 'remove') await State.updateOne({ consumerId: id }, { $pull: { [collection]: propertyId } });
  else {
    if (!(await published([propertyId])).length) throw notFound('Property unavailable');
    if (collection === 'recent') await State.updateOne({ consumerId: id }, [{ $set: { recent: { $slice: [{ $concatArrays: [[new mongoose.Types.ObjectId(propertyId)], { $filter: { input: '$recent', as: 'item', cond: { $ne: ['$$item', new mongoose.Types.ObjectId(propertyId)] } } }] }, 30] } } }]);
    else {
      const limit = collection === 'compare' ? 2 : 200;
      const result = await State.updateOne({ consumerId: id, $or: [{ [collection]: propertyId }, { $expr: { $lt: [{ $size: `$${collection}` }, limit] } }] }, { $addToSet: { [collection]: propertyId } });
      if (!result.matchedCount) throw new AppError(409, 'SELECTION_LIMIT', collection === 'compare' ? 'Compare up to two homes.' : 'Your Saved list is full.');
    }
  }
  res.json({ data: await state(id) });
}));
router.post('/merge', asyncHandler(async (req, res) => {
  const claims = req.body.viewings || [];
  if (!Array.isArray(claims) || claims.length > 30) throw badRequest('Invalid guest viewing selections');
  const requested = { saved: ids(req.body.saved || [], 200), compare: ids(req.body.compare || [], 2), recent: ids(req.body.recent || [], 30) };
  const allowed = new Set(await published([...new Set(Object.values(requested).flat())]));
  const consumerId = req.consumer.user.id;
  await ensure(consumerId);
  // Atomic union preserves device changes racing with a guest migration; existing compare order wins.
  const projection = {};
  for (const [key, max] of [['saved', 200], ['compare', 2], ['recent', 30]]) projection[key] = { $slice: [{ $concatArrays: [`$${key}`, { $filter: { input: requested[key].filter(id => allowed.has(id)).map(id => new mongoose.Types.ObjectId(id)), as: 'incoming', cond: { $not: [{ $in: ['$$incoming', `$${key}`] }] } } }] }, max] };
  await State.updateOne({ consumerId }, [{ $set: projection }]);
  const claimed = [];
  for (const claim of claims) {
    if (typeof claim?.id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(claim.id) || typeof claim.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(claim.token)) continue;
    const item = await Booking.findOneAndUpdate({ _id: claim.id, statusTokenHash: crypto.createHash('sha256').update(claim.token).digest('hex'), $or: [{ consumerId: { $exists: false } }, { consumerId }] }, { $set: { consumerId } }).select('_id').lean();
    if (item) claimed.push(String(item._id));
  }
  res.json({ data: await state(consumerId), claimedViewings: claimed });
}));
router.post('/preferences', asyncHandler(async (req, res) => {
  const { viewingUpdates, searchAlerts } = req.body;
  if (typeof viewingUpdates !== 'boolean' || typeof searchAlerts !== 'boolean') throw badRequest('Choose your notification preferences');
  await ensure(req.consumer.user.id);
  await State.updateOne({ consumerId: req.consumer.user.id }, { $set: { notifications: { viewingUpdates, searchAlerts } } });
  res.json({ data: await state(req.consumer.user.id) });
}));
router.get('/viewings', asyncHandler(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page)) || 1));
  const selector = { consumerId: req.consumer.user.id };
  const [data, total] = await Promise.all([Booking.find(selector).select('reference property scheduledAt status updatedAt createdAt').populate('property', 'title slug cover').sort({ scheduledAt: -1, _id: -1 }).skip((page - 1) * 30).limit(30).lean(), Booking.countDocuments(selector)]);
  res.json({ data, pagination: { page, limit: 30, total, pages: Math.ceil(total / 30) } });
}));
module.exports = router;
