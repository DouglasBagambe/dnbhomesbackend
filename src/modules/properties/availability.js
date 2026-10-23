const values = ["available", "reserved", "rented", "sold", "unavailable"];
const closed = ["rented", "sold"];
const visibleDays = 14;
function publicVisibility(now = new Date()) {
  return { $or: [
    { availabilityStatus: { $nin: closed } },
    { availabilityVisibleUntil: { $gt: now } },
  ] };
}
function acceptsViewings(property) {
  return property.status === "published" &&
    (property.availabilityStatus == null || property.availabilityStatus === "" || property.availabilityStatus === "available");
}
module.exports = { values, closed, visibleDays, publicVisibility, acceptsViewings };
