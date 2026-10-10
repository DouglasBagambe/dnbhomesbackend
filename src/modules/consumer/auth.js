const mongoose = require('mongoose');
const { AppError } = require('../../utils/errors');
const { sendCode } = require('./mail');
let cached;
let database;
let initializing;
let ProfileError;
async function getAuth() {
  if (initializing) return initializing;
  initializing = createAuth().catch(error => { cached = undefined; throw error; }).finally(() => { initializing = undefined; });
  return initializing;
}

function configured() { return process.env.CONSUMER_ACCOUNTS_ENABLED === 'true'; }
async function createAuth() {
  if (!configured()) throw new AppError(503, 'ACCOUNTS_UNAVAILABLE', 'Accounts are being prepared. You can continue as a guest.');
  if (!mongoose.connection.db) throw new AppError(503, 'ACCOUNTS_UNAVAILABLE', 'Accounts are temporarily unavailable.');
  if (cached && database === mongoose.connection.db) return cached;
  const secret = process.env.CONSUMER_AUTH_SECRET;
  const baseURL = process.env.CONSUMER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new AppError(503, 'ACCOUNTS_UNAVAILABLE', 'Account configuration is incomplete. You can continue as a guest.');
  const [{ betterAuth }, { mongodbAdapter }, { bearer, emailOTP }, { APIError }] = await Promise.all([import('better-auth/minimal'), import('@better-auth/mongo-adapter'), import('better-auth/plugins'), import('better-auth/api')]);
  ProfileError = APIError;
  database = mongoose.connection.db;
  cached = betterAuth({
    appName: 'Homes', secret, baseURL, basePath: '/api/v1/auth/consumer',
    database: mongodbAdapter(database, { client: mongoose.connection.getClient(), transaction: process.env.NODE_ENV !== 'test' && process.env.CONSUMER_MONGO_TRANSACTIONS !== 'false' }),
    trustedOrigins: (process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean),
    user: { modelName: 'consumerIdentity', additionalFields: { phone: { type: 'string', required: false, defaultValue: '' } }, deleteUser: { enabled: true, beforeDelete: async user => {
      // Retain the broker's operational viewing record, sever identity and erase consumer PII.
      await require('./state.model').deleteOne({ consumerId: user.id });
      await require('../bookings/booking.model').updateMany({ consumerId: user.id }, { $unset: { consumerId: 1, statusTokenHash: 1, notes: 1 }, $set: { guestName: 'Deleted account', guestEmail: '', guestPhone: '' } });
    } } },
    account: { modelName: 'consumerCredential' }, verification: { modelName: 'consumerVerification' },
    session: { modelName: 'consumerSession', expiresIn: 7 * 86400, updateAge: 86400, freshAge: 300, cookieCache: { enabled: false } },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true, revokeSessionsOnPasswordReset: true },
    emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true },
    rateLimit: { enabled: true, storage: 'database', modelName: 'consumerRateLimit', window: 60, max: 60, customRules: { '/sign-in/email': { window: 900, max: 10 }, '/sign-up/email': { window: 900, max: 5 } } },
    advanced: { cookiePrefix: 'homes-consumer', useSecureCookies: baseURL.startsWith('https:'), ipAddress: { ipAddressHeaders: ['x-homes-client-ip'] } },
    logger: { disabled: true },
    databaseHooks: { user: {
      create: { before: async user => { validateProfile(user); return { data: user }; } },
      update: { before: async user => { validateProfile(user); return { data: user }; } },
    } },
    plugins: [bearer({ requireSignature: true }), emailOTP({ otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed', disableSignUp: true, overrideDefaultEmailVerification: true, sendVerificationOTP: sendCode })],
  });
  await Promise.all([
    database.collection('consumerIdentity').createIndex({ email: 1 }, { unique: true }),
    database.collection('consumerSession').createIndex({ token: 1 }, { unique: true }),
    database.collection('consumerSession').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection('consumerCredential').createIndex({ userId: 1 }),
    database.collection('consumerVerification').createIndex({ identifier: 1 }),
    database.collection('consumerVerification').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return cached;
}

function validateProfile(user) {
  if (user.name !== undefined && (typeof user.name !== 'string' || user.name.trim().length < 2 || user.name.length > 100)) throw new ProfileError('BAD_REQUEST', {message:'Use a name between 2 and 100 characters'});
  if (user.phone !== undefined && (typeof user.phone !== 'string' || user.phone.length > 30 || (user.phone && !/^\+?[0-9 ()-]{7,30}$/.test(user.phone)))) throw new ProfileError('BAD_REQUEST', {message:'Use a valid phone number'});
}

async function identity(req, required = true) {
  const authorization = req.get('authorization');
  if (!authorization) {
    if (required) throw new AppError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
    return null;
  }
  // Cookie auth stays on the web BFF; public consumer APIs accept explicit signed bearer sessions only.
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: new Headers({ authorization }) });
  if (!session || !session.user.emailVerified) throw new AppError(401, 'SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
  return session;
}
async function handler(req, res, next) {
  try {
    const auth = await getAuth();
    // Discard untrusted client-provided forwarding headers; Express's configured proxy chain supplies req.ip.
    req.headers['x-homes-client-ip'] = require('./proxy-ip').clientIp(req);
    if (Number(req.get('content-length')) > 40000) throw new AppError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
    // Use the maintained adapter with a bounded stream and a configured origin, never a client Host header.
    const { getRequest, setResponse } = await import('better-call/node');
    res.set('Cache-Control', 'no-store');
    return setResponse(res, await auth.handler(getRequest({ request: req, base: new URL(process.env.CONSUMER_AUTH_URL).origin, bodySizeLimit: 40000 })));
  } catch (error) { next(error); }
}
module.exports = { getAuth, identity, handler, configured };
