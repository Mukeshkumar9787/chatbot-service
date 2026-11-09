const fs = require("fs");
const path = require("path");

// Load .env if present
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment or .env file.");
}

const dbConfig = {
  url: DATABASE_URL,
  dialect: "postgres",
  dialectOptions: {
    ssl: DATABASE_URL.includes("sslmode=require") || DATABASE_URL.includes("db.prisma.io")
      ? { rejectUnauthorized: false }
      : false,
  },
  logging: false,
};

module.exports = {
  development: dbConfig,
  test: dbConfig,
  production: dbConfig,
};

