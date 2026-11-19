import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Op } from "sequelize";
import {
  sequelize,
  Tenant,
  PlatformAdmin,
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
    CREATE TABLE IF NOT EXISTS tenants (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(64) UNIQUE NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      source VARCHAR(32) NOT NULL DEFAULT 'STANDALONE',
      plan_code VARCHAR(64) DEFAULT 'STANDALONE',
      ai_chatbot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      settings JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);
    CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

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

    // Seed default tenant if not exists
    try {
      await Tenant.findOrCreate({
        where: { id: "tenant_smk_default" },
        defaults: {
          id: "tenant_smk_default",
          name: "SMK Store (Default)",
          slug: "default",
          status: "ACTIVE",
          source: "SMK_ECOMMERCE",
          plan_code: "ENTERPRISE",
          ai_chatbot_enabled: true,
          settings: { storeName: "SMK Store" },
        },
      });
    } catch (e) {
      console.warn("[DB Init] Default tenant seed notice:", e);
    }

    // Seed default platform support user if not exists
    try {
      const supportEmail = (process.env.SUPPORT_ADMIN_EMAIL || "support@smk.com").toLowerCase().trim();
      const existingSupport = await User.findOne({
        where: {
          email: supportEmail,
          role: "SUPER_ADMIN",
        },
      });

      if (!existingSupport) {
        const defaultPassword = process.env.SUPPORT_ADMIN_PASSWORD || "Admin@123456";
        const hash = bcrypt.hashSync(defaultPassword, 10);
        await User.create({
          id: "user_support_admin",
          email: supportEmail,
          name: "Platform Support Admin",
          role: "SUPER_ADMIN",
          is_active: true,
          password_hash: hash,
          tenant_id: "system",
        });
      }
    } catch (e) {
      console.warn("[DB Init] Support user seed notice:", e);
    }

    // Seed Platform Admins (Dedicated platform_admins table)
    try {
      const targetEmail = "mukeshkumar87086@gmail.com";
      const targetPassword = process.env.MUKESH_ADMIN_PASSWORD || "Mukesh@Platform2026!";
      const targetHash = bcrypt.hashSync(targetPassword, 10);

      const [admin, created] = await PlatformAdmin.findOrCreate({
        where: { email: targetEmail },
        defaults: {
          id: "pl_admin_mukesh",
          email: targetEmail,
          name: "Mukesh Kumar (Platform Admin)",
          password_hash: targetHash,
          role: "SUPER_ADMIN",
          is_active: true,
        },
      });

      if (!created) {
        // Ensure active and password updated
        await admin.update({ password_hash: targetHash, is_active: true });
      }
    } catch (e) {
      console.warn("[DB Init] Platform admin seed notice:", e);
    }

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
  role: "SUPER_ADMIN" | "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
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

// -------------------------------------------------------------
// TENANT STORE & MULTI-TENANT LIFECYCLE
// -------------------------------------------------------------

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE";
  source: "SMK_ECOMMERCE" | "STANDALONE";
  plan_code?: string | null;
  ai_chatbot_enabled: boolean;
  settings?: any;
  created_at: string;
  updated_at: string;
}

function formatTenant(t: Tenant): TenantRecord {
  const json = t.toJSON() as any;
  return {
    ...json,
    created_at: json.created_at instanceof Date ? json.created_at.toISOString() : json.created_at,
    updated_at: json.updated_at instanceof Date ? json.updated_at.toISOString() : json.updated_at,
  };
}

export const dbTenantStore = {
  async getTenants(): Promise<TenantRecord[]> {
    return runWithBypass(async () => {
      await initDatabase();
      const tenants = await Tenant.findAll({
        order: [["created_at", "DESC"]],
      });
      return tenants.map((t) => formatTenant(t));
    });
  },

  async getTenantByIdOrSlug(idOrSlug: string): Promise<TenantRecord | null> {
    return runWithBypass(async () => {
      await initDatabase();
      const clean = idOrSlug.trim();
      const isDefaultAlias =
        clean === "smk_tenant" ||
        clean === "smk" ||
        clean === "default" ||
        clean === "tenant_smk_default";

      const tenant = await Tenant.findOne({
        where: {
          [Op.or]: [
            { id: clean },
            { slug: clean.toLowerCase() },
            ...(isDefaultAlias ? [{ id: "tenant_smk_default" }, { slug: "default" }] : []),
          ],
        },
      });
      return tenant ? formatTenant(tenant) : null;
    });
  },

  async createTenant(params: {
    id?: string;
    name: string;
    slug: string;
    status?: "ACTIVE" | "INACTIVE";
    source?: "SMK_ECOMMERCE" | "STANDALONE";
    planCode?: string;
    aiChatbotEnabled?: boolean;
    settings?: any;
  }): Promise<TenantRecord> {
    return runWithBypass(async () => {
      await initDatabase();
      const slugClean = params.slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
      const tenantId = params.id?.trim() || `tenant_${slugClean}_${Date.now()}`;

      const [tenant, created] = await Tenant.findOrCreate({
        where: { slug: slugClean },
        defaults: {
          id: tenantId,
          name: params.name.trim(),
          slug: slugClean,
          status: params.status || "ACTIVE",
          source: params.source || "STANDALONE",
          plan_code: params.planCode || "STANDALONE",
          ai_chatbot_enabled: params.aiChatbotEnabled !== undefined ? params.aiChatbotEnabled : true,
          settings: params.settings || {},
        },
      });

      if (!created) {
        await tenant.update({
          name: params.name.trim(),
          status: params.status || tenant.status,
          source: params.source || tenant.source,
          plan_code: params.planCode || tenant.plan_code,
          ai_chatbot_enabled: params.aiChatbotEnabled !== undefined ? params.aiChatbotEnabled : tenant.ai_chatbot_enabled,
          settings: params.settings !== undefined ? params.settings : tenant.settings,
        });
      }

      return formatTenant(tenant);
    });
  },

  async updateTenantStatus(idOrSlug: string, status: "ACTIVE" | "INACTIVE"): Promise<TenantRecord> {
    return runWithBypass(async () => {
      await initDatabase();
      const clean = idOrSlug.trim();
      const tenant = await Tenant.findOne({
        where: {
          [Op.or]: [{ id: clean }, { slug: clean.toLowerCase() }],
        },
      });
      if (!tenant) throw new Error(`Tenant '${idOrSlug}' not found.`);
      await tenant.update({ status });
      return formatTenant(tenant);
    });
  },

  async isTenantActive(idOrSlug: string): Promise<boolean> {
    return runWithBypass(async () => {
      await initDatabase();
      const clean = idOrSlug.trim();
      const tenant = await Tenant.findOne({
        where: {
          [Op.or]: [{ id: clean }, { slug: clean.toLowerCase() }],
        },
      });
      if (!tenant) {
        // Fallback for default SMK tenant if not in DB yet
        if (clean === "tenant_smk_default" || clean === "default" || clean === "smk" || clean === "smk_tenant") return true;
        return false;
      }
      return tenant.status === "ACTIVE" && tenant.ai_chatbot_enabled;
    });
  },
};

// -------------------------------------------------------------
// PLATFORM ADMIN STORE
// -------------------------------------------------------------

export const dbPlatformAdminStore = {
  async getByEmail(email: string): Promise<PlatformAdmin | null> {
    return runWithBypass(async () => {
      await initDatabase();
      const emailNorm = email.toLowerCase().trim();
      return PlatformAdmin.findOne({
        where: sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), emailNorm),
      });
    });
  },

  async getById(id: string): Promise<PlatformAdmin | null> {
    return runWithBypass(async () => {
      await initDatabase();
      return PlatformAdmin.findByPk(id);
    });
  },

  async getAll(): Promise<PlatformAdmin[]> {
    return runWithBypass(async () => {
      await initDatabase();
      return PlatformAdmin.findAll({
        attributes: { exclude: ["password_hash"] },
        order: [["created_at", "ASC"]],
      });
    });
  },
};


