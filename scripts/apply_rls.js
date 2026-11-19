const fs = require("fs");
const path = require("path");
const pg = require("pg");

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
  console.error("[Chatbot RLS Setup] ERROR: DATABASE_URL is missing.");
  process.exit(1);
}

async function applyChatbotRLS() {
  console.log("[Chatbot RLS Setup] Connecting to PostgreSQL database...");
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("sslmode=require") || DATABASE_URL.includes("db.prisma.io")
      ? { rejectUnauthorized: false }
      : false,
  });

  await client.connect();

  console.log("[Chatbot RLS Setup] Ensuring tenant_id column exists on conversations, messages, and users...");
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default';
    UPDATE users SET tenant_id = 'tenant_smk_default' WHERE tenant_id IS NULL;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
    DROP INDEX IF EXISTS idx_users_email;
    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, LOWER(email));

    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default';
    CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
  `);

  console.log("[Chatbot RLS Setup] Enabling Row-Level Security on conversations, messages, and users...");
  await client.query(`
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE users FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS chatbot_users_tenant_policy ON users;
    CREATE POLICY chatbot_users_tenant_policy ON users
      FOR ALL
      TO PUBLIC
      USING (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = current_setting('app.current_tenant_id', true)
      )
      WITH CHECK (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = current_setting('app.current_tenant_id', true)
      );

    ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS chatbot_conversations_tenant_policy ON conversations;
    CREATE POLICY chatbot_conversations_tenant_policy ON conversations
      FOR ALL
      TO PUBLIC
      USING (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = current_setting('app.current_tenant_id', true)
      )
      WITH CHECK (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = current_setting('app.current_tenant_id', true)
      );

    ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE messages FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS chatbot_messages_tenant_policy ON messages;
    CREATE POLICY chatbot_messages_tenant_policy ON messages
      FOR ALL
      TO PUBLIC
      USING (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = current_setting('app.current_tenant_id', true)
      )
      WITH CHECK (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = current_setting('app.current_tenant_id', true)
      );
  `);

  console.log("✅ [Chatbot RLS Setup] Row-Level Security successfully applied to chatbot tables!");
  await client.end();
}

applyChatbotRLS().catch((err) => {
  console.error("❌ [Chatbot RLS Setup] Failed to apply RLS:", err);
  process.exit(1);
});
