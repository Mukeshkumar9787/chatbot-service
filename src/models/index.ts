import { Sequelize, DataTypes, Model, Optional } from "sequelize";
import pg from "pg";
import { getTenantContext, DEFAULT_TENANT_ID } from "../lib/tenantContext";

const DATABASE_URL = process.env.DATABASE_URL || "";

declare global {
  // eslint-disable-next-line no-var
  var __chatbotSequelize: Sequelize | undefined;
}

export function getSequelize(): Sequelize {
  if (!globalThis.__chatbotSequelize) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required for Chatbot PostgreSQL connection.");
    }

    const seq = new Sequelize(DATABASE_URL, {
      dialect: "postgres",
      dialectModule: pg,
      dialectOptions: {
        ssl: DATABASE_URL.includes("sslmode=require") || DATABASE_URL.includes("db.prisma.io")
          ? { rejectUnauthorized: false }
          : false,
      },
      logging: false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    });

    const cm = seq.connectionManager as any;
    const origGetConnection = cm.getConnection.bind(cm);
    cm.getConnection = async function (options: any) {
      const connection = await origGetConnection(options);
      try {
        const ctx = getTenantContext();
        const tid = ctx?.tenantId || DEFAULT_TENANT_ID;

        if (ctx?.bypassRls) {
          try {
            await connection.query("RESET ROLE;");
          } catch (e) {}
          await connection.query("SELECT set_config('app.bypass_rls', 'true', false);");
        } else {
          try {
            await connection.query("SET ROLE prisma_application;");
          } catch (e) {}
          await connection.query(
            "SELECT set_config('app.current_tenant_id', $1, false), set_config('app.bypass_rls', 'false', false);",
            [tid]
          );
        }
      } catch (err) {
        console.error("[Chatbot RLS Connection Setup Error]:", err);
      }
      return connection;
    };

    globalThis.__chatbotSequelize = seq;
  }
  return globalThis.__chatbotSequelize;
}

export const sequelize = getSequelize();

// -------------------------------------------------------------------
// 0. Tenant Model
// -------------------------------------------------------------------
export interface TenantAttributes {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE";
  source: "SMK_ECOMMERCE" | "STANDALONE";
  plan_code?: string | null;
  ai_chatbot_enabled: boolean;
  settings?: any;
  created_at?: Date;
  updated_at?: Date;
}

export interface TenantCreationAttributes
  extends Optional<TenantAttributes, "id" | "status" | "source" | "plan_code" | "ai_chatbot_enabled" | "settings" | "created_at" | "updated_at"> {}

export class Tenant extends Model<TenantAttributes, TenantCreationAttributes> implements TenantAttributes {
  public id!: string;
  public name!: string;
  public slug!: string;
  public status!: "ACTIVE" | "INACTIVE";
  public source!: "SMK_ECOMMERCE" | "STANDALONE";
  public plan_code!: string | null;
  public ai_chatbot_enabled!: boolean;
  public settings!: any;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Tenant.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "STANDALONE",
    },
    plan_code: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: "STANDALONE",
    },
    ai_chatbot_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "tenants",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["slug"],
      },
      {
        fields: ["status"],
      },
    ],
  }
);

// -------------------------------------------------------------------
// 0a. PlatformAdmin Model (Dedicated Platform Support Admins)
// -------------------------------------------------------------------
export interface PlatformAdminAttributes {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "SUPER_ADMIN" | "SUPPORT_ADMIN";
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface PlatformAdminCreationAttributes
  extends Optional<PlatformAdminAttributes, "id" | "role" | "is_active" | "created_at" | "updated_at"> {}

export class PlatformAdmin
  extends Model<PlatformAdminAttributes, PlatformAdminCreationAttributes>
  implements PlatformAdminAttributes
{
  public id!: string;
  public email!: string;
  public name!: string;
  public password_hash!: string;
  public role!: "SUPER_ADMIN" | "SUPPORT_ADMIN";
  public is_active!: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

PlatformAdmin.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      defaultValue: () => `pl_admin_${Date.now()}`,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    password_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "SUPER_ADMIN",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: "platform_admins",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["email"],
      },
    ],
  }
);

// -------------------------------------------------------------------
// 1. User Model
// -------------------------------------------------------------------
export interface UserAttributes {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
  is_active: boolean;
  password_hash?: string | null;
  tenant_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserCreationAttributes
  extends Optional<UserAttributes, "id" | "is_active" | "role" | "tenant_id" | "created_at" | "updated_at"> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public name!: string;
  public role!: "SUPER_ADMIN" | "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
  public is_active!: boolean;
  public password_hash!: string | null;
  public tenant_id!: string | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      defaultValue: () => `user_${Date.now()}`,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "SUPPORT_OPERATOR",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    password_hash: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tenant_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: "tenant_smk_default",
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["tenant_id", "email"],
      },
      {
        fields: ["tenant_id"],
      },
    ],
  }
);

// -------------------------------------------------------------------
// 2. Token Blacklist Model
// -------------------------------------------------------------------
export interface TokenBlacklistAttributes {
  token: string;
  created_at?: Date;
}

export class TokenBlacklist
  extends Model<TokenBlacklistAttributes, TokenBlacklistAttributes>
  implements TokenBlacklistAttributes
{
  public token!: string;
  public readonly created_at!: Date;
}

TokenBlacklist.init(
  {
    token: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "tokens_blacklist",
    timestamps: false,
  }
);

// -------------------------------------------------------------------
// 3. Conversation Model
// -------------------------------------------------------------------
export interface ConversationAttributes {
  id: string;
  user_id?: string | null;
  session_id?: string | null;
  title?: string | null;
  tenant_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ConversationCreationAttributes
  extends Optional<ConversationAttributes, "user_id" | "session_id" | "title" | "tenant_id" | "created_at" | "updated_at"> {}

export class Conversation
  extends Model<ConversationAttributes, ConversationCreationAttributes>
  implements ConversationAttributes
{
  public id!: string;
  public user_id!: string | null;
  public session_id!: string | null;
  public title!: string | null;
  public tenant_id!: string | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Conversation.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    session_id: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    tenant_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: "tenant_smk_default",
    },
  },
  {
    sequelize,
    tableName: "conversations",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// -------------------------------------------------------------------
// 4. Message Model
// -------------------------------------------------------------------
export interface MessageAttributes {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: any;
  tenant_id?: string | null;
  created_at?: Date;
}

export class Message
  extends Model<MessageAttributes, MessageAttributes>
  implements MessageAttributes
{
  public id!: string;
  public conversation_id!: string;
  public role!: "user" | "assistant" | "system";
  public content!: string;
  public sources!: any;
  public tenant_id!: string | null;
  public readonly created_at!: Date;
}

Message.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    conversation_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
      references: {
        model: "conversations",
        key: "id",
      },
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    sources: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    tenant_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: "tenant_smk_default",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "messages",
    timestamps: false,
  }
);

// -------------------------------------------------------------------
// Associations
// -------------------------------------------------------------------
User.hasMany(Conversation, {
  foreignKey: "user_id",
  as: "conversations",
  onDelete: "SET NULL",
});
Conversation.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

Conversation.hasMany(Message, {
  foreignKey: "conversation_id",
  as: "messages",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Message.belongsTo(Conversation, {
  foreignKey: "conversation_id",
  as: "conversation",
});
