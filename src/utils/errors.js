class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const notFound = (message = "Resource not found") => new AppError(404, "NOT_FOUND", message);
const badRequest = (message, details) => new AppError(400, "VALIDATION_ERROR", message, details);

module.exports = { AppError, notFound, badRequest };
