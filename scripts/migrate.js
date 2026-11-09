const fs = require("fs");
const path = require("path");
const { Sequelize } = require("sequelize");

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
  console.error("[Chatbot DB Setup] ERROR: DATABASE_URL environment variable is missing.");
  process.exit(1);
}

/**
 * Executes rerunnable, idempotent DDL queries for chatbot PostgreSQL tables.
 * No migration tracking table (such as SequelizeMeta) is used.
 * Document data is stored exclusively in Qdrant.
 */
async function runRerunnableSchemaQueries() {
  console.log(`[Chatbot DB Setup] Connecting to PostgreSQL database...`);
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
    console.log("[Chatbot DB Setup] Executing rerunnable schema queries...");

    const ddl = `
      -- 1. Users Table (identified strictly by email)
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'SUPPORT_OPERATOR',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        password_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE users DROP COLUMN IF EXISTS ecom_user_id;
      DROP INDEX IF EXISTS idx_users_ecom_id;

      CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));

      -- 2. Token Blacklist Table
      CREATE TABLE IF NOT EXISTS tokens_blacklist (
        token TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 3. Conversations Table
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR(128),
        title VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id);

      -- 4. Messages Table
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        sources JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at ASC);
    `;

    await sequelize.query(ddl);

    // Drop any obsolete document tables or migration tracking tables if they exist
    await sequelize.query(`
      DROP TABLE IF EXISTS document_chunks CASCADE;
      DROP TABLE IF EXISTS documents CASCADE;
      DROP TABLE IF EXISTS "SequelizeMeta" CASCADE;
    `);

    console.log("[Chatbot DB Setup] ✓ Rerunnable schema queries executed successfully.");
    console.log("[Chatbot DB Setup] ✓ All document storage directed exclusively to Qdrant.");
  } catch (err) {
    console.error("[Chatbot DB Setup] Query execution failed:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runRerunnableSchemaQueries();
