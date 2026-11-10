import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  sequelize,
  User,
  TokenBlacklist,
  Conversation,
  Message,
} from "../models";

let dbInitialized = false;

/**
 * Initializes schema tables in PostgreSQL with rerunnable, idempotent queries.
 * No migration tracking tables (e.g. SequelizeMeta) are used.
 * Document data is stored exclusively in Qdrant.
 */
export async function initDatabase() {
  if (dbInitialized) return;
  await sequelize.authenticate();

  const ddl = `
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

    CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id);

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
  dbInitialized = true;
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
  async getUsers(): Promise<Omit<RAGUser, "password_hash">[]> {
    await initDatabase();
    const users = await User.findAll({
      attributes: { exclude: ["password_hash"] },
      order: [["created_at", "ASC"]],
    });
    return users.map((u) => sanitizeUser(formatUser(u)));
  },

  async getUserByEmail(email: string): Promise<RAGUser | null> {
    await initDatabase();
    const user = await User.findOne({
      where: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("email")),
        email.toLowerCase().trim()
      ),
    });
    return user ? formatUser(user) : null;
  },

  async getUserById(id: string): Promise<RAGUser | null> {
    await initDatabase();
    const user = await User.findByPk(id);
    return user ? formatUser(user) : null;
  },

  async createOrUpdateUser(params: {
    email: string;
    name: string;
    role: "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
    is_active: boolean;
    password?: string;
  }): Promise<RAGUser> {
    await initDatabase();
    const emailNorm = params.email.toLowerCase().trim();

    const user = await User.findOne({
      where: sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), emailNorm),
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
    });

    return formatUser(newUser);
  },

  async deleteUser(userId: string): Promise<boolean> {
    await initDatabase();
    const count = await User.destroy({ where: { id: userId } });
    return count > 0;
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
  created_at: string;
}

export const dbChatStore = {
  async getOrCreateConversation(params: {
    conversationId?: string;
    sessionId?: string;
    userId?: string;
    title?: string;
  }): Promise<{ id: string; isNew: boolean }> {
    await initDatabase();

    if (params.conversationId) {
      const existing = await Conversation.findByPk(params.conversationId);
      if (existing) {
        return { id: existing.id, isNew: false };
      }
    }

    const newId = params.conversationId || crypto.randomUUID();
    const conv = await Conversation.create({
      id: newId,
      user_id: params.userId || null,
      session_id: params.sessionId || null,
      title: params.title || "Store Assistant Chat",
    });

    return { id: conv.id, isNew: true };
  },

  async saveMessage(params: {
    conversationId: string;
    role: "user" | "assistant" | "system";
    content: string;
    sources?: any;
  }): Promise<ChatbotMessage> {
    await initDatabase();
    const msgId = crypto.randomUUID();

    const msg = await Message.create({
      id: msgId,
      conversation_id: params.conversationId,
      role: params.role,
      content: params.content,
      sources: params.sources || null,
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
  },

  async getMessages(conversationId: string): Promise<ChatbotMessage[]> {
    await initDatabase();
    const messages = await Message.findAll({
      where: { conversation_id: conversationId },
      order: [["created_at", "ASC"]],
    });
    return messages.map((m) => {
      const json = m.toJSON() as any;
      return {
        ...json,
        created_at: json.created_at instanceof Date ? json.created_at.toISOString() : json.created_at,
      };
    });
  },
};
