const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const Property = require("../src/modules/properties/property.model");
const Agent = require("../src/modules/agents/agent.model");
const Agency = require("../src/modules/agents/agency.model");

const SEED_TAG = "demo:homes-v1";
const mediaPublicUrl = (process.env.MEDIA_PUBLIC_URL || "http://localhost:3000/media").replace(/\/+$/, "");
const demoImage = (index) => `${mediaPublicUrl}/demo/homes-${String((index % 10) + 1).padStart(2, "0")}.jpg`;

const locations = [
  ...["Kololo", "Naguru", "Muyenga", "Ntinda", "Bugolobi", "Munyonyo"].flatMap((area) => Array(3).fill({ district: "Kampala", area })),
  ...["Bukoto", "Kisasi", "Kyanja", "Naalya", "Lubowa", "Makindye"].flatMap((area) => Array(2).fill({ district: "Kampala", area })),
  ...["Kira", "Najjera"].flatMap((area) => Array(2).fill({ district: "Wakiso", area })),
  ...["Kajjansi", "Bwebajja", "Akright", "Kitende"].map((area) => ({ district: "Wakiso", area })),
  ...Array(4).fill({ district: "Wakiso", area: "Entebbe" }),
  ...Array(3).fill({ district: "Jinja", area: "Jinja City" }),
  ...Array(2).fill({ district: "Mukono", area: "Mukono Town" }),
  ...Array(2).fill({ district: "Mbarara", area: "Mbarara City" }),
  { district: "Kabarole", area: "Fort Portal" },
];

const normalTypes = ["apartment", "house", "apartment", "house", "serviced_apartment", "apartment", "house"];
const subtype = ["Apartment", "Family Home", "Townhouse", "Studio", "Bungalow", "Villa", "Furnished Apartment"];
const amenities = [
  ["Parking", "Security", "Balcony", "Water tank"], ["Garden", "Gated compound", "Parking", "Servant quarters"], ["Security", "Backup power", "Wi-Fi", "CCTV"],
  ["Furnished", "Kitchen", "Wi-Fi", "Air conditioning"], ["Parking", "Security", "Swimming pool", "Backup power"], ["Balcony", "Kitchen", "Water tank"],
];
const coordinates = {
  Kampala: [32.5825, 0.3476], Wakiso: [32.4594, 0.3984], Jinja: [33.2032, 0.4479], Mukono: [32.7553, 0.3533], Mbarara: [30.6545, -0.6072], Kabarole: [30.2748, 0.671],
};
const descriptions = [
  "A well-kept home with practical rooms, secure access and convenient connections to everyday services.",
  "Comfortable living space in an established neighbourhood, with good natural light and useful outdoor space.",
  "A thoughtfully arranged property suited to everyday living, close to shops, schools and main transport routes.",
  "Bright, functional interiors and a quiet setting make this a comfortable base for work and home life.",
];

function category(index) {
  if (index < 25) return { purpose: "rent", type: normalTypes[index % normalTypes.length], period: "month", label: subtype[index % subtype.length] };
  if (index < 39) return { purpose: "sale", type: normalTypes[index % normalTypes.length], period: "total", label: subtype[index % subtype.length] };
  if (index < 45) return { purpose: "short_stay", type: index % 2 ? "serviced_apartment" : "guest_house", period: "night", label: index % 2 ? "Serviced Apartment" : "Guest House" };
  if (index < 48) return { purpose: "sale", type: "land", period: "total", label: "Residential Plot" };
  return { purpose: "rent", type: "commercial", period: "month", label: index === 48 ? "Office Space" : "Commercial Space" };
}

function priceFor(index, item) {
  if (item.type === "land") return 85000000 + (index - 45) * 70000000;
  if (item.type === "commercial") return 3500000 + (index - 48) * 4500000;
  if (item.purpose === "short_stay") return 140000 + (index - 39) * 85000;
  if (item.purpose === "sale") return 180000000 + (index - 25) * 115000000;
  return 650000 + (index % 9) * 575000;
}

function buildProperty(index, representatives) {
  const number = index + 1;
  const loc = locations[index];
  const item = category(index);
  const bedrooms = item.type === "land" || item.type === "commercial" ? 0 : item.label === "Studio" ? 0 : 1 + (index % 5);
  const title = item.type === "land" ? `Residential Plot in ${loc.area}` : item.type === "commercial" ? `${item.label} in ${loc.area}` : `${item.label} in ${loc.area}`;
  const media = Array.from({ length: 5 }, (_, offset) => ({ url: demoImage(index * 3 + offset), type: "image", alt: `Demo property image ${offset + 1}` }));
  const baseCoordinates = coordinates[loc.district] || coordinates.Wakiso;
  return {
    title, slug: `demo-homes-v1-${String(number).padStart(3, "0")}`, description: descriptions[index % descriptions.length],
    purpose: item.purpose, type: item.type, price: { amount: priceFor(index, item), currency: "UGX", period: item.period },
    location: { country: "Uganda", region: "Central", district: loc.district, area: loc.area, address: `${loc.area}, ${loc.district}`, coordinates: { type: "Point", coordinates: [baseCoordinates[0] + (index % 5) * .002, baseCoordinates[1] + (index % 7) * .002] } },
    bedrooms, bathrooms: bedrooms ? Math.max(1, Math.min(bedrooms, 4)) : item.type === "commercial" ? 2 : 0,
    size: item.type === "land" ? .25 + (index - 45) * .25 : item.type === "commercial" ? 180 + (index - 48) * 140 : 48 + (index % 7) * 32,
    sizeUnit: item.type === "land" ? "acres" : "sqm", amenities: item.type === "land" ? ["Road access", "Surveyed boundaries"] : amenities[index % amenities.length],
    tags: [SEED_TAG, "demo", item.label.toLowerCase().replaceAll(" ", "-")], media, cover: media[0],
    agent: representatives.agents[index % representatives.agents.length]._id, agency: representatives.agency._id,
    featured: index % 8 === 0, verificationStatus: index % 4 === 0 ? "verified" : "unverified", status: "published",
    publishedAt: new Date(Date.UTC(2026, 6, 1) + index * 86400000), viewCount: (index * 37) % 420,
  };
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production");
  await connectDatabase();
  const agency = await Agency.findOneAndUpdate(
    { slug: "homes-demo-realty" },
    { $set: { name: "Homes Demo Realty", logo: "", phone: "+256 700 000 100", email: "agency.demo@example.com", description: "A development-only agency profile used to verify the Homes marketplace experience.", verificationStatus: "verified", status: "active", tags: [SEED_TAG, "demo"] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const agentSeeds = [
    { name: "Amina Nansubuga", slug: "amina-nansubuga", photo: "" },
    { name: "Daniel Okello", slug: "daniel-okello", photo: "" },
    { name: "Sarah Namuli", slug: "sarah-namuli", photo: "" },
  ];
  const agents = [];
  for (const seed of agentSeeds) {
    agents.push(await Agent.findOneAndUpdate(
      { slug: seed.slug },
      { $set: { ...seed, agency: agency._id, phone: "+256 700 000 101", whatsapp: "+256700000101", email: `${seed.slug}@example.com`, verificationStatus: "verified", status: "active", tags: [SEED_TAG, "demo"] } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ));
  }
  const records = Array.from({ length: 50 }, (_, index) => buildProperty(index, { agency, agents }));
  const operations = records.map((record) => ({ updateOne: { filter: { slug: record.slug, tags: SEED_TAG }, update: { $set: record }, upsert: true } }));
  const result = await Property.bulkWrite(operations);
  const count = await Property.countDocuments({ tags: SEED_TAG, status: "published" });
  console.log(JSON.stringify({ seed: SEED_TAG, demoProperties: count, demoAgents: agents.length, demoAgencies: 1, inserted: result.upsertedCount, updated: result.modifiedCount }));
  if (count !== 50) throw new Error(`Expected 50 demo properties, found ${count}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => disconnectDatabase());
