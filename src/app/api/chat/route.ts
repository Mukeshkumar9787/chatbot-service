import { NextRequest, NextResponse } from "next/server";
import { computeEmbedding } from "@/lib/embeddings";
import { searchQdrant } from "@/lib/qdrant";
import { generateGroundedAnswer, generateGroundedAnswerStream } from "@/lib/generator";
import { dbChatStore } from "@/lib/db";
import {
  validateInput,
  validateAndSanitizeOutput,
  createStreamingOutputGuardrail,
} from "@/lib/guardrails";

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

    // 0. Apply Input Guardrail (prompt injection, credit card PII, flooding, safety)
    const inputGuard = validateInput(message);
    if (!inputGuard.allowed) {
      const fallback = inputGuard.fallbackResponse || "I cannot process this request.";

      if (body.stream !== false) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "meta",
                  conversation_id: conversationId || "guardrail_blocked",
                  sources: [],
                  guardrail_blocked: true,
                  reason: inputGuard.flaggedReason,
                })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "chunk",
                  text: fallback,
                })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "done",
                  answer: fallback,
                  guardrail_blocked: true,
                  reason: inputGuard.flaggedReason,
                })}\n\n`
              )
            );
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      }

      return NextResponse.json({
        success: true,
        conversation_id: conversationId || "guardrail_blocked",
        query: message,
        answer: fallback,
        sources: [],
        total_sources_found: 0,
        guardrail_blocked: true,
        reason: inputGuard.flaggedReason,
      });
    }

    const cleanUserMessage = inputGuard.sanitizedInput;

    // 1. Get or create conversation in PostgreSQL
    const conv = await dbChatStore.getOrCreateConversation({
      conversationId,
      sessionId,
      userId,
      title: cleanUserMessage.slice(0, 50),
    });

    // 2. Retrieve prior conversation history with role context before persisting new message
    let history: Array<{ role: string; content: string }> = [];
    if (conv?.id) {
      const priorMessages = await dbChatStore.getMessages(conv.id);
      if (priorMessages && priorMessages.length > 0) {
        history = priorMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
      }
    }

    if (history.length === 0 && Array.isArray(body.history)) {
      history = body.history.map((m: any) => ({
        role: m.role || "user",
        content: m.content || m.text || "",
      }));
    }

    // 3. Persist user message in PostgreSQL
    await dbChatStore.saveMessage({
      conversationId: conv.id,
      role: "user",
      content: cleanUserMessage,
    });

    // 4. Embed query vector
    const queryVector = await computeEmbedding(cleanUserMessage);

    // 5. Retrieve top-k semantic vector matches from Qdrant, mapped with PostgreSQL chunk contents
    const retrievedChunks = await searchQdrant(queryVector, 4, 0.05);

    const sources = retrievedChunks.map((c) => ({
      document: c.filename,
      chunk_index: c.chunk_index,
      snippet: c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
      relevance_score: c.score,
    }));

    // If non-streaming is explicitly requested
    if (body.stream === false) {
      const rawAnswer = await generateGroundedAnswer(cleanUserMessage, retrievedChunks, history);
      const outputGuard = validateAndSanitizeOutput(rawAnswer);
      const answer = outputGuard.sanitizedOutput;

      await dbChatStore.saveMessage({
        conversationId: conv.id,
        role: "assistant",
        content: answer,
        sources,
      });

      return NextResponse.json({
        success: true,
        conversation_id: conv.id,
        query: cleanUserMessage,
        answer,
        sources,
        total_sources_found: sources.length,
        guardrail_flags: outputGuard.flags,
      });
    }

    // Default: Streaming response (SSE / ReadableStream)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 1. Send metadata event (conversation_id and sources)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "meta",
                conversation_id: conv.id,
                sources,
              })}\n\n`
            )
          );

          // 2. Stream generation chunks in real time through output guardrail
          let fullAnswer = "";
          for await (const chunk of createStreamingOutputGuardrail(
            generateGroundedAnswerStream(cleanUserMessage, retrievedChunks, history)
          )) {
            fullAnswer += chunk;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "chunk",
                  text: chunk,
                })}\n\n`
              )
            );
          }

          // 3. Final comprehensive output validation & sanitization
          const finalOutputGuard = validateAndSanitizeOutput(fullAnswer);
          const sanitizedAnswer = finalOutputGuard.sanitizedOutput;

          // 4. Persist complete assistant answer and sources in PostgreSQL
          await dbChatStore.saveMessage({
            conversationId: conv.id,
            role: "assistant",
            content: sanitizedAnswer,
            sources,
          });

          // 5. Send completion event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                answer: sanitizedAnswer,
                guardrail_flags: finalOutputGuard.flags,
              })}\n\n`
            )
          );

          controller.close();
        } catch (err: any) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[Chat API Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
