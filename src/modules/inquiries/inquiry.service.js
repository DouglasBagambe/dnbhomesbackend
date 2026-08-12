const mongoose = require("mongoose");
const Inquiry = require("./inquiry.model");
const { badRequest, notFound } = require("../../utils/errors");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roles = ["owner", "agent", "agency", "developer"];
const statuses = ["new", "in_progress", "resolved", "spam"];
const bounded = (value, max) => String(value || "").trim().slice(0, max);

function validateCommon(body) {
  const name = bounded(body.name, 120);
  const email = bounded(body.email, 200).toLowerCase();
  const phone = bounded(body.phone, 50);
  const message = bounded(body.message, 5000);
  if (!name || !message) throw badRequest("Name and message are required");
  if (email && !emailPattern.test(email)) throw badRequest("Enter a valid email address");
  if (phone && phone.length < 7) throw badRequest("Enter a valid phone number");
  return { name, email, phone, message };
}

async function createContact(body) {
  const values = validateCommon(body);
  if (!values.email) throw badRequest("Email is required");
  const subject = bounded(body.subject, 160);
  if (!subject) throw badRequest("Subject is required");
  return Inquiry.create({ kind: "contact", ...values, subject });
}

async function createListing(body) {
  const values = validateCommon(body);
  const role = bounded(body.role, 30);
  const propertyType = bounded(body.propertyType, 80);
  const location = bounded(body.location, 160);
  if (!values.phone) throw badRequest("Phone is required");
  if (!roles.includes(role)) throw badRequest("Choose a valid owner or representative role");
  if (!propertyType || !location) throw badRequest("Property type and location are required");
  return Inquiry.create({ kind: "listing", ...values, role, propertyType, location });
}

async function list(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = {};
  if (["contact", "listing"].includes(query.kind)) filter.kind = query.kind;
  if (statuses.includes(query.status)) filter.status = query.status;
  if (query.q) {
    const q = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 100), "i");
    filter.$or = [{ name: q }, { email: q }, { phone: q }, { subject: q }, { location: q }];
  }
  const [data, total] = await Promise.all([
    Inquiry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Inquiry.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function update(id, body) {
  if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid inquiry identifier");
  const item = await Inquiry.findById(id);
  if (!item) throw notFound("Inquiry not found");
  if (body.status !== undefined) {
    if (!statuses.includes(body.status)) throw badRequest("Invalid inquiry status");
    item.status = body.status;
  }
  if (body.adminNotes !== undefined) item.adminNotes = bounded(body.adminNotes, 5000);
  return item.save();
}

module.exports = { createContact, createListing, list, update };
