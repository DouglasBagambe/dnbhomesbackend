const mongoose = require("mongoose");
const env = require("./env");

async function connectDatabase(uri = env.mongoUri) {
  if (!uri) throw new Error("MONGO_URI is required");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
