const crypto = require("node:crypto");
const Grant = require("./upload-grant.model");
const Admin = require("../auth/admin.model");
const { AppError } = require("../../utils/errors");
const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
async function issue(admin, origin) {
  require("./media.service").assertUploadStorage();
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new AppError(
      400,
      "INVALID_ORIGIN",
      "A valid upload origin is required",
    );
  }
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
    throw new AppError(
      400,
      "INVALID_ORIGIN",
      "A valid upload origin is required",
    );
  const token = crypto.randomBytes(32).toString("base64url");
  const actor = await Admin.findById(admin.id).select("+tokenVersion");
  if (!actor || actor.status !== "active")
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  const expiresAt = new Date(Date.now() + 120000);
  await Grant.create({
    tokenHash: digest(token),
    actor: actor.id,
    tokenVersion: actor.tokenVersion,
    origin,
    expiresAt,
  });
  return { token, expiresAt, maxFiles: 10, maxBatchBytes: 100 * 1024 * 1024 };
}
async function authorize(req, res, next) {
  const deny = (
    reason,
    code = "UPLOAD_AUTH_UNAVAILABLE",
    message = "Upload authorization expired or is unavailable. Please retry.",
  ) => {
    req.log?.warn(
      {
        code,
        reason,
        stage: "media.authorization",
        origin: req.get("origin") || null,
      },
      "Media upload authorization rejected",
    );
    return new AppError(401, code, message);
  };
  try {
    const token = req.get("X-Media-Upload-Token");
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw deny("missing_or_malformed");
    const hash = digest(token);
    const grant = await Grant.findOneAndDelete({
      tokenHash: hash,
      origin: req.get("origin"),
      expiresAt: { $gt: new Date() },
    });
    if (!grant) {
      // Diagnostic lookup is server-only; never log token values or their hashes.
      const known = await Grant.findOne({ tokenHash: hash })
        .select("origin expiresAt")
        .lean();
      if (known && known.origin !== req.get("origin"))
        throw deny(
          "origin_mismatch",
          "UPLOAD_ORIGIN_DENIED",
          "Upload origin is not allowed. Please use the authorized Admin address.",
        );
      if (known && known.expiresAt <= new Date())
        throw deny(
          "expired",
          "UPLOAD_AUTH_EXPIRED",
          "Upload authorization expired. Please retry.",
        );
      throw deny("unknown_or_consumed");
    }
    const actor = await Admin.findById(grant.actor).select("+tokenVersion");
    if (!actor || actor.status !== "active") throw deny("actor_inactive");
    if (actor.tokenVersion !== grant.tokenVersion)
      throw deny("session_revoked");
    req.admin = actor;
    next();
  } catch (error) {
    next(error);
  }
}
module.exports = { issue, authorize };
