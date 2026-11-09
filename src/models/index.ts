import { Sequelize, DataTypes, Model, Optional } from "sequelize";

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

    globalThis.__chatbotSequelize = new Sequelize(DATABASE_URL, {
      dialect: "postgres",
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
  }
  return globalThis.__chatbotSequelize;
}

export const sequelize = getSequelize();

// -------------------------------------------------------------------
// 1. User Model
// -------------------------------------------------------------------
export interface UserAttributes {
  id: string;
  email: string;
  name: string;
  role: "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
  is_active: boolean;
  password_hash?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserCreationAttributes
  extends Optional<UserAttributes, "id" | "is_active" | "role" | "created_at" | "updated_at"> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public name!: string;
  public role!: "SUPPORT_ADMIN" | "SUPPORT_OPERATOR" | "INACTIVE";
  public is_active!: boolean;
  public password_hash!: string | null;
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
      unique: true,
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
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
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
  created_at?: Date;
  updated_at?: Date;
}

export interface ConversationCreationAttributes
  extends Optional<ConversationAttributes, "user_id" | "session_id" | "title" | "created_at" | "updated_at"> {}

export class Conversation
  extends Model<ConversationAttributes, ConversationCreationAttributes>
  implements ConversationAttributes
{
  public id!: string;
  public user_id!: string | null;
  public session_id!: string | null;
  public title!: string | null;
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
