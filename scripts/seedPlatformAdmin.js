const fs = require("fs");
const path = require("path");

// Load .env manually
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
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
const bcrypt = require("bcryptjs");
const pg = require("pg");
const { Sequelize, DataTypes } = require("sequelize");

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not defined in .env");
    process.exit(1);
  }

  const seq = new Sequelize(dbUrl, {
    dialect: "postgres",
    dialectModule: pg,
    dialectOptions: {
      ssl: { rejectUnauthorized: false },
    },
    logging: false,
  });

  await seq.authenticate();
  console.log("Connected to PostgreSQL successfully.");

  // Create platform_admins table
  const ddl = `
    CREATE TABLE IF NOT EXISTS platform_admins (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'SUPER_ADMIN',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admins_email ON platform_admins (LOWER(email));
  `;
  await seq.query(ddl);
  console.log("platform_admins table created or verified.");

  const email = "mukeshkumar87086@gmail.com";
  const rawPassword = process.env.MUKESH_ADMIN_PASSWORD || "Mukesh@Platform2026!";
  const hash = bcrypt.hashSync(rawPassword, 10);

  const [existing] = await seq.query(
    "SELECT * FROM platform_admins WHERE LOWER(email) = LOWER($1)",
    { bind: [email] }
  );

  if (existing && existing.length > 0) {
    await seq.query(
      "UPDATE platform_admins SET password_hash = $1, is_active = true, updated_at = NOW() WHERE LOWER(email) = LOWER($2)",
      { bind: [hash, email] }
    );
    console.log(`Updated platform admin password for ${email}`);
  } else {
    await seq.query(
      `INSERT INTO platform_admins (id, email, name, password_hash, role, is_active, created_at, updated_at)
       VALUES ('pl_admin_mukesh', $1, 'Mukesh Kumar', $2, 'SUPER_ADMIN', true, NOW(), NOW())`,
      { bind: [email, hash] }
    );
    console.log(`Successfully onboarded platform admin ${email}`);
  }

  const [allAdmins] = await seq.query(
    "SELECT id, email, name, role, is_active, created_at FROM platform_admins"
  );
  console.log("Current Platform Admins in DB:", allAdmins);

  await seq.close();
}

seed().catch((err) => {
  console.error("Error seeding platform admin:", err);
  process.exit(1);
});
