import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Op } from "sequelize";
import {
  sequelize,
  User,
  TokenBlacklist,
  Conversation,
  Message,
} from "../models";
import { runWithBypass, runWithTenant, getCurrentTenantId } from "./tenantContext";

let dbInitialized = false;

/**
 * Initializes schema tables in PostgreSQL with rerunnable, idempotent queries.
 * No migration tracking tables (e.g. SequelizeMeta) are used.
 * Document data is stored exclusively in Qdrant.
 */
export async function initDatabase() {
  if (dbInitialized) return;
  return runWithBypass(async () => {
    if (dbInitialized) return;
    await sequelize.authenticate();

    const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'SUPPORT_OPERATOR',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      password_hash TEXT,
      tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default';
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
    DROP INDEX IF EXISTS idx_users_email;
    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, LOWER(email));

    ALTER TABLE users DROP COLUMN IF EXISTS ecom_user_id;
    DROP INDEX IF EXISTS idx_users_ecom_id;

    CREATE TABLE IF NOT EXISTS tokens_blacklist (
      token TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      session_id VARCHAR(128),
      title VARCHAR(255),
      tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default';
    CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      sources JSONB,
      tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'tenant_smk_default';
    CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at ASC);

    -- Enable and enforce PostgreSQL Row Level Security
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
  `;

    await sequelize.query(ddl);
    dbInitialized = true;
  });
}

export function getSequelizeInstance() {
  return sequelize;
}

// -------------------------------------------------------------
// USER & AUTHENTICATION OPERATIONS (Sequelize ORM)
// -------------------------------------------------------------

export interface RAGUser {
  id: string;
  email: string;
  name: string;
  role: "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
  is_active: boolean;
  password_hash?: string | null;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
}

export function sanitizeUser<T extends Record<string, any>>(u: T): Omit<T, "password_hash" | "password"> {
  if (!u) return u;
  const { password_hash, password, ...safeUser } = u;
  return safeUser as Omit<T, "password_hash" | "password">;
}

function formatUser(u: User): RAGUser {
  const json = u.toJSON() as any;
  return {
    ...json,
    created_at: json.created_at instanceof Date ? json.created_at.toISOString() : json.created_at,
    updated_at: json.updated_at instanceof Date ? json.updated_at.toISOString() : json.updated_at,
  };
}

export const dbUserStore = {
  async getUsers(tenantId?: string): Promise<Omit<RAGUser, "password_hash">[]> {
    const targetTenantId = tenantId || getCurrentTenantId();
    return runWithTenant(targetTenantId, async () => {
      await initDatabase();
      const whereClause: any = {};
      if (tenantId) {
        whereClause.tenant_id = tenantId;
      }
      const users = await User.findAll({
        where: whereClause,
        attributes: { exclude: ["password_hash"] },
        order: [["created_at", "ASC"]],
      });
      return users.map((u) => sanitizeUser(formatUser(u)));
    });
  },

  async getUserByEmail(email: string, tenantId?: string): Promise<RAGUser | null> {
    const targetTenantId = tenantId || getCurrentTenantId();
    return runWithTenant(targetTenantId, async () => {
      await initDatabase();
      const emailNorm = email.toLowerCase().trim();
      const whereClause: any = {
        [Op.and]: [
          sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), emailNorm),
        ],
      };
      if (tenantId) {
        whereClause.tenant_id = tenantId;
      }
      const user = await User.findOne({
        where: whereClause,
      });
      return user ? formatUser(user) : null;
    });
  },

  async getUserById(id: string, tenantId?: string): Promise<RAGUser | null> {
    const targetTenantId = tenantId || getCurrentTenantId();
    return runWithTenant(targetTenantId, async () => {
      await initDatabase();
      const whereClause: any = { id };
      if (tenantId) {
        whereClause.tenant_id = tenantId;
      }
      const user = await User.findOne({ where: whereClause });
      return user ? formatUser(user) : null;
    });
  },

  async createOrUpdateUser(params: {
    email: string;
    name: string;
    role: "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
    is_active: boolean;
    password?: string;
    tenantId?: string;
  }): Promise<RAGUser> {
    const targetTenantId = params.tenantId || getCurrentTenantId();
    return runWithTenant(targetTenantId, async () => {
      await initDatabase();
      const emailNorm = params.email.toLowerCase().trim();

      const user = await User.findOne({
        where: {
          tenant_id: targetTenantId,
          [Op.and]: [
            sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), emailNorm),
          ],
        },
      });

      if (user) {
        const updateData: any = {
          role: params.role,
          is_active: params.is_active,
          name: params.name || user.name,
        };
        if (params.password) updateData.password_hash = bcrypt.hashSync(params.password, 10);

        await user.update(updateData);
        return formatUser(user);
      }

      const newUser = await User.create({
        id: `user_${Date.now()}`,
        email: emailNorm,
        name: params.name,
        role: params.role,
        is_active: params.is_active,
        password_hash: params.password ? bcrypt.hashSync(params.password, 10) : null,
        tenant_id: targetTenantId,
      });

      return formatUser(newUser);
    });
  },

  async deleteUser(userId: string, tenantId?: string): Promise<boolean> {
    const targetTenantId = tenantId || getCurrentTenantId();
    return runWithTenant(targetTenantId, async () => {
      await initDatabase();
      const whereClause: any = { id: userId };
      if (tenantId) {
        whereClause.tenant_id = tenantId;
      }
      const count = await User.destroy({ where: whereClause });
      return count > 0;
    });
  },

  async updatePassword(userId: string, newPasswordPlain: string, tenantId?: string): Promise<boolean> {
    const targetTenantId = tenantId || getCurrentTenantId();
    return runWithTenant(targetTenantId, async () => {
      await initDatabase();
      const whereClause: any = { id: userId };
      if (tenantId) {
        whereClause.tenant_id = tenantId;
      }
      const user = await User.findOne({ where: whereClause });
      if (!user) return false;
      const password_hash = bcrypt.hashSync(newPasswordPlain, 10);
      await user.update({ password_hash });
      return true;
    });
  },

  async blacklistToken(token: string): Promise<void> {
    await initDatabase();
    await TokenBlacklist.upsert({
      token,
      created_at: new Date(),
    });
  },

  async isTokenBlacklisted(token: string): Promise<boolean> {
    await initDatabase();
    const found = await TokenBlacklist.findByPk(token);
    return !!found;
  },
};

// -------------------------------------------------------------
// CONVERSATIONS & CHAT MESSAGES (Sequelize ORM)
// -------------------------------------------------------------

export interface ChatbotMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: any;
  tenant_id?: string;
  created_at: string;
}

export const dbChatStore = {
  async getOrCreateConversation(params: {
    conversationId?: string;
    sessionId?: string;
    userId?: string;
    title?: string;
    tenantId?: string | null;
  }): Promise<{ id: string; isNew: boolean }> {
    const tenantId = params.tenantId || getCurrentTenantId();
    return runWithTenant(tenantId, async () => {
      await initDatabase();

      if (params.conversationId) {
        const existing = await Conversation.findByPk(params.conversationId);
        if (existing) {
          // If existing record lacks tenant_id, backfill it
          if (!existing.tenant_id && tenantId) {
            await existing.update({ tenant_id: tenantId });
          }
          return { id: existing.id, isNew: false };
        }
      }

      const newId = params.conversationId || crypto.randomUUID();
      const conv = await Conversation.create({
        id: newId,
        user_id: params.userId || null,
        session_id: params.sessionId || null,
        title: params.title || "Store Assistant Chat",
        tenant_id: tenantId,
      });

      return { id: conv.id, isNew: true };
    });
  },

  async saveMessage(params: {
    conversationId: string;
    role: "user" | "assistant" | "system";
    content: string;
    sources?: any;
    tenantId?: string | null;
  }): Promise<ChatbotMessage> {
    const tenantId = params.tenantId || getCurrentTenantId();
    return runWithTenant(tenantId, async () => {
      await initDatabase();
      const msgId = crypto.randomUUID();

      const msg = await Message.create({
        id: msgId,
        conversation_id: params.conversationId,
        role: params.role,
        content: params.content,
        sources: params.sources || null,
        tenant_id: tenantId,
        created_at: new Date(),
      });

      // Touch conversation updated_at
      await Conversation.update(
        { updated_at: new Date() },
        { where: { id: params.conversationId } }
      );

      const json = msg.toJSON() as any;
      return {
        ...json,
        created_at: json.created_at instanceof Date ? json.created_at.toISOString() : json.created_at,
      };
    });
  },

  async getMessages(conversationId: string, tenantId?: string | null): Promise<ChatbotMessage[]> {
    const targetTenantId = tenantId || getCurrentTenantId();
    return runWithTenant(targetTenantId, async () => {
      await initDatabase();
      const whereClause: any = { conversation_id: conversationId };
      if (tenantId) {
        whereClause.tenant_id = tenantId;
      }
      const messages = await Message.findAll({
        where: whereClause,
        order: [["created_at", "ASC"]],
      });
      return messages.map((m) => {
        const json = m.toJSON() as any;
        return {
          ...json,
          created_at: json.created_at instanceof Date ? json.created_at.toISOString() : json.created_at,
        };
      });
    });
  },
};
