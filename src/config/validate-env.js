const net = require("node:net");
const localHost = (host) => host === "localhost" || host.endsWith(".localhost") || !host.includes(".") || net.isIP(host.replace(/^\[|\]$/g, "")) !== 0 || /\.(local|test|invalid|example)$/.test(host) || /(^|\.)example\.(com|net|org)$/.test(host);
function publicHttps(value, key, originOnly = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${key} must be a public HTTPS URL`); }
  if (url.protocol !== "https:" || localHost(url.hostname) || url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== "/")) throw new Error(`${key} must be a public HTTPS ${originOnly ? "origin" : "URL"}`);
  return url;
}
function validateEnvironment(values) {
  const environment = values.NODE_ENV || "development";
  if (!["development", "test", "staging", "production"].includes(environment)) throw new Error("Invalid NODE_ENV");
  if (values.MEDIA_DRIVER && !["local", "s3"].includes(values.MEDIA_DRIVER)) throw new Error("Invalid MEDIA_DRIVER");
  if (values.PORT && (!/^\d+$/.test(values.PORT) || Number(values.PORT) < 1 || Number(values.PORT) > 65535)) throw new Error("Invalid PORT");
  if (values.REFRESH_TOKEN_DAYS && (!/^\d+$/.test(values.REFRESH_TOKEN_DAYS) || Number(values.REFRESH_TOKEN_DAYS) < 1)) throw new Error("Invalid REFRESH_TOKEN_DAYS");
  if (values.ACCESS_TOKEN_TTL && !/^\d+[smhd]$/.test(values.ACCESS_TOKEN_TTL)) throw new Error("ACCESS_TOKEN_TTL must be a positive duration such as 15m");
  if (values.TRUST_PROXY && !/^\d+$/.test(values.TRUST_PROXY)) throw new Error("TRUST_PROXY must be the verified number of proxy hops (0 for direct access)");
  if (values.CONSUMER_ACCOUNTS_ENABLED && !['true', 'false'].includes(values.CONSUMER_ACCOUNTS_ENABLED)) throw new Error('Invalid CONSUMER_ACCOUNTS_ENABLED');
  if (values.CONSUMER_ACCOUNTS_ENABLED === 'true' && ['staging', 'production'].includes(environment)) {
    const secret = values.CONSUMER_AUTH_SECRET || '';
    if (secret.length < 32 || /replace|development|example|placeholder/i.test(secret) || [values.JWT_ACCESS_SECRET, values.JWT_REFRESH_SECRET].includes(secret)) throw new Error('CONSUMER_AUTH_SECRET must be strong and independent');
    const proxySecret = values.CONSUMER_WEB_PROXY_SECRET || '';
    if (proxySecret.length < 32 || /replace|development|example|placeholder/i.test(proxySecret) || [secret,values.JWT_ACCESS_SECRET,values.JWT_REFRESH_SECRET].includes(proxySecret)) throw new Error('CONSUMER_WEB_PROXY_SECRET must be strong and independent');
    publicHttps(values.CONSUMER_AUTH_URL, 'CONSUMER_AUTH_URL', true);
    if (values.CONSUMER_MAIL_DRIVER !== 'smtp') throw new Error('Hosted consumer accounts require authenticated SMTP delivery');
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'CONSUMER_MAIL_FROM']) if (!values[key]?.trim()) throw new Error(`Missing required environment variable: ${key}`);
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(values.CONSUMER_MAIL_FROM)) throw new Error('CONSUMER_MAIL_FROM must be a verified sender email');
    if (values.SMTP_PORT && !['465', '587'].includes(values.SMTP_PORT)) throw new Error('Hosted SMTP requires TLS port 465 or 587');
    if (values.CONSUMER_MONGO_TRANSACTIONS === 'false') throw new Error('Hosted accounts require MongoDB transactions');
  }
  if (environment !== "production") return;
  for (const key of ["MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CORS_ORIGINS", "TRUST_PROXY", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"]) {
    if (!values[key]?.trim()) throw new Error(`Missing required environment variable: ${key}`);
  }
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    if (values[key].length < 32 || /replace|change.before|development|example|placeholder/i.test(values[key])) throw new Error(`${key} must be a strong production secret`);
  }
  if (values.JWT_ACCESS_SECRET === values.JWT_REFRESH_SECRET) throw new Error("JWT secrets must be independent");
  if (values.MEDIA_DRIVER !== "s3") throw new Error("Production requires MEDIA_DRIVER=s3");
  publicHttps(values.S3_ENDPOINT, "S3_ENDPOINT"); publicHttps(values.S3_PUBLIC_URL, "S3_PUBLIC_URL");
  const origins = values.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  if (!origins.length) throw new Error("CORS_ORIGINS must contain explicit origins");
  origins.forEach((origin) => publicHttps(origin, "CORS_ORIGINS", true));
  // Atlas SRV enforces TLS by default. Standard Mongo deployments must opt into TLS explicitly.
  const mongo = values.MONGO_URI;
  if (!/^mongodb(\+srv)?:\/\//.test(mongo)) throw new Error("Invalid production MONGO_URI");
  const [authority, tail = ""] = mongo.replace(/^mongodb(\+srv)?:\/\//, "").split(/\/(.*)/s);
  const hosts = authority.split("@").pop().split(",");
  const database = tail.split("?")[0];
  const query = new URLSearchParams(tail.split("?")[1]);
  if (!database || /development|demo|(^|[_-])test($|[_-])/i.test(database) || hosts.some((host) => localHost(host.replace(/:\d+$/, ""))) || ["tls", "ssl"].some((key) => query.get(key) === "false") || ["tlsAllowInvalidCertificates", "tlsAllowInvalidHostnames", "tlsInsecure"].some((key) => query.get(key) === "true") || (!mongo.startsWith("mongodb+srv://") && query.get("tls") !== "true" && query.get("ssl") !== "true")) throw new Error("MONGO_URI must select an isolated production database with verified TLS on public database hosts");
}
function requireDemoDatabase(values) {
  if (values.NODE_ENV !== "development") throw new Error("Demo operations require NODE_ENV=development");
  const uri = values.MONGO_URI || "mongodb://127.0.0.1:27017/homes_development";
  if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/homes_development(?:\?.*)?$/.test(uri)) throw new Error("Demo operations require the loopback homes_development database");
}
module.exports = { validateEnvironment, requireDemoDatabase };
