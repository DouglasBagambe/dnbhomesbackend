const mongoose = require("mongoose");
const env = require("../config/env");

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  req.log?.error({ err: error }, "request failed");
  let status = error.status || 500;
  let code = error.code || "INTERNAL_ERROR";
  let message = error.message || "An unexpected error occurred";
  let details = error.details;
  if (error instanceof mongoose.Error.CastError) {
    status = 400; code = "INVALID_ID"; message = "Invalid resource identifier"; details = undefined;
  } else if (error instanceof mongoose.Error.ValidationError) {
    status = 400; code = "VALIDATION_ERROR"; message = "Request validation failed";
    details = Object.values(error.errors).map((item) => item.message);
  } else if (error.code === 11000) {
    status = 409; code = "CONFLICT"; message = "A record with these details already exists"; details = undefined;
  }
  if (status >= 500 && env.isProduction) message = "An unexpected error occurred";
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

module.exports = { notFoundHandler, errorHandler };
