import { NextRequest, NextResponse } from "next/server";
import { computeEmbedding } from "@/lib/embeddings";
import { searchQdrant } from "@/lib/qdrant";
import { generateGroundedAnswer } from "@/lib/generator";
import { dbChatStore } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId query parameter is required" },
        { status: 400 }
      );
    }

    const messages = await dbChatStore.getMessages(conversationId);
    return NextResponse.json({
      success: true,
      conversation_id: conversationId,
      messages,
    });
  } catch (err: any) {
    console.error("[Chat API GET Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message?.trim();
    const conversationId = body.conversationId || body.conversation_id;
    const sessionId = body.sessionId || body.session_id;
    const userId = body.userId || body.user_id;

    if (!message) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    // 1. Get or create conversation in PostgreSQL
    const conv = await dbChatStore.getOrCreateConversation({
      conversationId,
      sessionId,
      userId,
      title: message.slice(0, 50),
    });

    // 2. Persist user message in PostgreSQL
    await dbChatStore.saveMessage({
      conversationId: conv.id,
      role: "user",
      content: message,
    });

    // 3. Embed query vector
    const queryVector = await computeEmbedding(message);

    // 4. Retrieve top-k semantic vector matches from Qdrant, mapped with PostgreSQL chunk contents
    const retrievedChunks = await searchQdrant(queryVector, 4, 0.05);

    // 5. Generate grounded answer
    const answer = await generateGroundedAnswer(message, retrievedChunks);

    const sources = retrievedChunks.map((c) => ({
      document: c.filename,
      chunk_index: c.chunk_index,
      snippet: c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
      relevance_score: c.score,
    }));

    // 6. Persist assistant response & citations in PostgreSQL
    await dbChatStore.saveMessage({
      conversationId: conv.id,
      role: "assistant",
      content: answer,
      sources,
    });

    return NextResponse.json({
      success: true,
      conversation_id: conv.id,
      query: message,
      answer,
      sources,
      total_sources_found: sources.length,
    });
  } catch (err: any) {
    console.error("[Chat API Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
