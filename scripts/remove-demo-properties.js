const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const Property = require("../src/modules/properties/property.model");
const Agent = require("../src/modules/agents/agent.model");
const Agency = require("../src/modules/agents/agency.model");
const Booking = require("../src/modules/bookings/booking.model");

const SEED_TAG = "demo:homes-v1";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo cleanup is disabled in production");
  await connectDatabase();
  const propertyIds = await Property.distinct("_id", { tags: SEED_TAG });
  const [bookings, properties, agents, agencies] = await Promise.all([
    Booking.deleteMany({ property: { $in: propertyIds } }),
    Property.deleteMany({ tags: SEED_TAG }),
    Agent.deleteMany({ tags: SEED_TAG }),
    Agency.deleteMany({ tags: SEED_TAG }),
  ]);
  console.log(JSON.stringify({ seed: SEED_TAG, removed: { bookings: bookings.deletedCount, properties: properties.deletedCount, agents: agents.deletedCount, agencies: agencies.deletedCount } }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => disconnectDatabase());
