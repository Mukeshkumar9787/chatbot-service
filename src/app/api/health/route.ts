import { NextResponse } from "next/server";
import { ensureCollection, getQdrantHeaders } from "@/lib/qdrant";
import { initDatabase, getSequelizeInstance } from "@/lib/db";

export const dynamic = "force-dynamic";

const QDRANT_URL = (process.env.QDRANT_URL || "").replace(/\/+$/, "");

export async function GET() {
  let qdrantStatus = "unknown";
  let collections: string[] = [];
  let pgStatus = "unknown";
  let dbTablesCount = 0;
  let dbName = "unknown";

  try {
    // 1. Check PostgreSQL via Sequelize ORM
    await initDatabase();
    const sequelize = getSequelizeInstance();
    const [pgRes, dbRes] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*) FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN ('users', 'tokens_blacklist', 'conversations', 'messages');`
      ),
      sequelize.query(`SELECT current_database();`),
    ]);
    const pgRows = (pgRes[0] || []) as any[];
    const dbRows = (dbRes[0] || []) as any[];

    dbTablesCount = parseInt(pgRows[0]?.count || "0", 10);
    dbName = dbRows[0]?.current_database || "unknown";
    pgStatus = "connected";
  } catch (err: any) {
    pgStatus = `disconnected (${err.message})`;
  }

  try {
    // 2. Check Qdrant
    await ensureCollection();
    const res = await fetch(`${QDRANT_URL}/collections`, {
      headers: getQdrantHeaders(),
    });
    const data = await res.json();
    collections = (data.result?.collections || []).map((c: any) => c.name);
    qdrantStatus = "connected";
  } catch (err: any) {
    qdrantStatus = `disconnected (${err.message})`;
  }

  const isHealthy = pgStatus === "connected" && qdrantStatus === "connected";

  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "degraded",
      service: "nextjs-qdrant-chatbot-service",
      database: {
        orm: "Sequelize ORM (Rerunnable Idempotent DDL)",
        type: "PostgreSQL",
        database: dbName,
        status: pgStatus,
        tables_detected: dbTablesCount,
        managed_tables: ["users", "tokens_blacklist", "conversations", "messages"],
      },
      document_store: {
        type: "Qdrant Vector Database",
        status: qdrantStatus,
        qdrant_url: QDRANT_URL,
        collections,
        note: "All document metadata, text chunks, and vectors are stored exclusively in Qdrant.",
      },
    },
    { status: isHealthy ? 200 : 500 }
  );
}
