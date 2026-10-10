const mongoose = require("mongoose");
const env = require("../config/env");

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  req.log?.error(env.isProduction ? { errorType: error.name, status: error.status || 500 } : { err: error }, "request failed");
  let status = error.status || 500;
  let code = error.code || "INTERNAL_ERROR";
  let message = error.message || "An unexpected error occurred";
  let details = error.details;
  if (error.name === "MulterError") {
    status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400; code = error.code;
    message = error.code === "LIMIT_FILE_SIZE" ? "Videos must not exceed 50 MB; images must not exceed 10 MB" : "Upload at most 10 files per request"; details = undefined;
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400; code = "INVALID_ID"; message = "Invalid resource identifier"; details = undefined;
  } else if (error instanceof mongoose.Error.ValidationError) {
    status = 400; code = "VALIDATION_ERROR"; message = "Request validation failed";
    details = Object.values(error.errors).map((item) => item.message);
  } else if (error.code === 11000) {
    status = 409; code = "CONFLICT"; message = "A record with these details already exists"; details = undefined;
  }
  if (status >= 500 && env.isProduction) { message = "An unexpected error occurred"; code = "INTERNAL_ERROR"; details = undefined; }
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

module.exports = { notFoundHandler, errorHandler };
