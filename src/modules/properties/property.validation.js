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
  if (errors.length) throw badRequest("Property validation failed", errors);
}
module.exports = { validateProperty, statuses };
