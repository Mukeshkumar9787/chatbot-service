const fs = require("fs");
const path = require("path");
const { Sequelize, DataTypes, Op } = require("sequelize");
const bcrypt = require("bcryptjs");

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
  console.error("[Chatbot DB Seed] ERROR: DATABASE_URL environment variable is missing.");
  process.exit(1);
}

async function seedAdminUsers() {
  console.log(`[Chatbot DB Seed] Connecting to PostgreSQL database...`);
  const sequelize = new Sequelize(DATABASE_URL, {
    dialect: "postgres",
    dialectOptions: {
      ssl: DATABASE_URL.includes("sslmode=require") || DATABASE_URL.includes("db.prisma.io")
        ? { rejectUnauthorized: false }
        : false,
    },
    logging: false,
  });

  try {
    await sequelize.authenticate();

    const User = sequelize.define(
      "User",
      {
        id: { type: DataTypes.STRING(64), primaryKey: true },
        email: { type: DataTypes.STRING(255), unique: true, allowNull: false },
        name: { type: DataTypes.STRING(255), allowNull: false },
        role: { type: DataTypes.STRING(50), defaultValue: "SUPPORT_OPERATOR" },
        is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
        password_hash: { type: DataTypes.TEXT, allowNull: true },
      },
      { tableName: "users", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" }
    );

    // 1. Purge any non-admin users so that ONLY admin users are present in the database
    const removedCount = await User.destroy({
      where: {
        role: {
          [Op.ne]: "SUPPORT_ADMIN",
        },
      },
    });
    if (removedCount > 0) {
      console.log(`[Chatbot DB Seed] Removed ${removedCount} non-admin user(s) to guarantee only admin users exist.`);
    }

    const primaryAdminEmail = (process.env.ADMIN_EMAIL || "admin@smk.internal").toLowerCase().trim();
    const primaryAdminPassword = process.env.ADMIN_PASSWORD || "SupportAdmin@123";

    // 2. Define the Admin accounts to seed (identified strictly by email)
    const adminSeeds = [
      {
        id: "admin_internal",
        email: primaryAdminEmail,
        name: process.env.ADMIN_NAME || "Primary Support Admin",
        role: "SUPPORT_ADMIN",
        is_active: true,
        password: primaryAdminPassword,
      },
      {
        id: "admin_ecom_101",
        email: "admin@smk.com",
        name: "System Admin",
        role: "SUPPORT_ADMIN",
        is_active: true,
        password: "Admin@123",
      },
    ];

    console.log(`[Chatbot DB Seed] Provisioning admin users in chatbot PostgreSQL database:`);

    for (const item of adminSeeds) {
      const passwordHash = bcrypt.hashSync(item.password, 10);
      const existing = await User.findOne({
        where: sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), item.email),
      });

      if (existing) {
        await existing.update({
          name: item.name,
          role: "SUPPORT_ADMIN",
          is_active: true,
          password_hash: passwordHash,
        });
        console.log(`  ✓ Updated admin: ${item.email} (ID: ${existing.id}, role: SUPPORT_ADMIN)`);
      } else {
        const created = await User.create({
          id: item.id,
          email: item.email,
          name: item.name,
          role: "SUPPORT_ADMIN",
          is_active: true,
          password_hash: passwordHash,
        });
        console.log(`  ✓ Created admin: ${created.email} (ID: ${created.id}, role: SUPPORT_ADMIN)`);
      }
    }

    // 3. Final verification of users in database
    const finalUsers = await User.findAll({
      attributes: ["id", "email", "name", "role", "is_active"],
    });
    console.log("\n[Chatbot DB Seed] Current users in 'users' table (all must be admin):");
    console.table(finalUsers.map((u) => u.toJSON()));
  } catch (err) {
    console.error("[Chatbot DB Seed] Seed process failed:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seedAdminUsers();
