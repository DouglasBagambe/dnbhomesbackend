const { badRequest } = require("../../utils/errors");
const purposes = ["rent", "sale", "short_stay"];
const types = ["apartment", "house", "land", "commercial", "hotel", "guest_house", "serviced_apartment", "other"];
const statuses = ["draft", "pending_review", "published", "archived"];

function validateProperty(body, partial = false) {
  const errors = [];
  if (!partial) for (const field of ["title", "description", "purpose", "type", "price", "location"]) if (body[field] === undefined) errors.push(`${field} is required`);
  if (body.purpose && !purposes.includes(body.purpose)) errors.push("purpose is invalid");
  if (body.type && !types.includes(body.type)) errors.push("type is invalid");
  if (body.status && !statuses.includes(body.status)) errors.push("status is invalid");
  if (body.price && (!Number.isFinite(Number(body.price.amount)) || Number(body.price.amount) < 0)) errors.push("price.amount must be a non-negative number");
  if (body.location?.coordinates?.coordinates) {
    const [longitude, latitude] = body.location.coordinates.coordinates;
    if (!(longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90)) errors.push("coordinates must be [longitude, latitude]");
  }
  if (body.media !== undefined) {
    if (!Array.isArray(body.media) || body.media.length > 40) errors.push("media must be an array of at most 40 items");
    else for (const item of body.media) {
      if (!item || !["image", "video"].includes(item.type) || typeof item.url !== "string") { errors.push("Every media item requires an image/video type and URL"); continue; }
      try { const url = new URL(item.url); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) errors.push("Media URLs must use HTTP(S) without credentials"); } catch { errors.push("Invalid media URL"); }
    }
  }
  if (body.cover != null) {
    if (body.cover.type !== "image" || typeof body.cover.url !== "string") errors.push("cover must be an image with a URL");
    else { try { const url = new URL(body.cover.url); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) errors.push("Cover URL must use HTTP(S) without credentials"); } catch { errors.push("Invalid cover URL"); } }
  }
  if (errors.length) throw badRequest("Property validation failed", errors);
}
module.exports = { validateProperty, statuses };
