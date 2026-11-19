import { NextRequest, NextResponse } from "next/server";
import { computeEmbedding } from "@/lib/embeddings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { searchQdrant } from "@/lib/qdrant";
import { generateGroundedAnswer, generateGroundedAnswerStream } from "@/lib/generator";
import { dbChatStore, dbTenantStore } from "@/lib/db";
import {
  validateInput,
  validateAndSanitizeOutput,
  createStreamingOutputGuardrail,
} from "@/lib/guardrails";
import {
  chatRateLimiter,
  getClientIp,
  createRateLimitResponse,
} from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  findSemanticCacheMatch,
  storeInSemanticCache,
  recordCacheHit,
} from "@/lib/semanticCache";
import { runWithTenant } from "@/lib/tenantContext";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const tenantId = params.tenantId?.trim() || "tenant_smk_default";

    return await runWithTenant(tenantId, async () => {
      const { searchParams } = new URL(req.url);
      const conversationId = searchParams.get("conversationId");

      if (!conversationId) {
        return NextResponse.json(
          { error: "conversationId query parameter is required" },
          { status: 400 }
        );
      }

      const messages = await dbChatStore.getMessages(conversationId, tenantId);
      return NextResponse.json({
        success: true,
        conversation_id: conversationId,
        tenant_id: tenantId,
        messages,
      });
    });
  } catch (err: any) {
    console.error("[Chat API GET Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const tenantId = params.tenantId?.trim() || "tenant_smk_default";

    return await runWithTenant(tenantId, async () => {
      const isTenantActive = await dbTenantStore.isTenantActive(tenantId);
      if (!isTenantActive) {
        return NextResponse.json(
          {
            error: "Chatbot assistant is currently disabled or inactive for this store.",
            status: "INACTIVE",
          },
          { status: 403 }
        );
      }

      // 0a. Check sliding-window rate limit (20 req/min per IP)
      const clientIp = getClientIp(req);
      const rateLimitResult = chatRateLimiter.check(clientIp, {
        windowMs: 60 * 1000,
        maxRequests: 20,
      });

      if (!rateLimitResult.allowed) {
        return createRateLimitResponse(
          rateLimitResult,
          "Taking a quick breather! Please wait a moment before sending another message."
        );
      }

      const body = await req.json();
      // Strictly strip tenantId from request body - tenant must be specified in the URL directly
      delete body.tenantId;
      delete body.tenant_id;
      delete body.tenantSlug;
      delete body.tenant;

      const message = body.message?.trim();
      const conversationId = body.conversationId || body.conversation_id;
      const sessionId = body.sessionId || body.session_id;
      const userId = body.userId || body.user_id;

    // 0b. Verify Cloudflare Turnstile token if provided
    const turnstileToken =
      body.turnstileToken ||
      req.headers.get("x-turnstile-token") ||
      req.headers.get("cf-turnstile-token");

    if (turnstileToken) {
      const turnstileResult = await verifyTurnstile(turnstileToken, req);
      if (!turnstileResult.success) {
        return NextResponse.json(
          {
            success: false,
            error:
              turnstileResult.error ||
              "Cloudflare Turnstile CAPTCHA verification failed.",
            errorCodes: turnstileResult.errorCodes,
          },
          { status: 400 }
        );
      }
    }

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
      tenantId,
    });

    // 2. Retrieve prior conversation history with role context before persisting new message
    let history: Array<{ role: string; content: string }> = [];
    if (conv?.id) {
      const priorMessages = await dbChatStore.getMessages(conv.id, tenantId);
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
      tenantId,
    });

    // 4. Embed query vector
    const queryVector = await computeEmbedding(cleanUserMessage);

    // 4b. Check Semantic Cache for fast-path hit (cosine similarity >= threshold)
    const cachedMatch = await findSemanticCacheMatch(queryVector, undefined, tenantId);
    if (cachedMatch?.hit && cachedMatch.answer) {
      if (cachedMatch.id) {
        recordCacheHit(cachedMatch.id, cachedMatch.hit_count).catch(console.error);
      }

      await dbChatStore.saveMessage({
        conversationId: conv.id,
        role: "assistant",
        content: cachedMatch.answer,
        sources: cachedMatch.sources || [],
        tenantId,
      });

      if (body.stream === false) {
        return NextResponse.json(
          {
            success: true,
            conversation_id: conv.id,
            tenant_id: tenantId,
            query: cleanUserMessage,
            answer: cachedMatch.answer,
            sources: cachedMatch.sources || [],
            total_sources_found: (cachedMatch.sources || []).length,
            cached: true,
            cache_similarity: cachedMatch.score,
          },
          {
            headers: {
              "X-Chatbot-Cache": "HIT",
            },
          }
        );
      }

      // Fast streaming response from semantic cache
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "meta",
                conversation_id: conv.id,
                tenant_id: tenantId,
                sources: cachedMatch.sources || [],
                cached: true,
                cache_similarity: cachedMatch.score,
              })}\n\n`
            )
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "chunk",
                text: cachedMatch.answer,
              })}\n\n`
            )
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                answer: cachedMatch.answer,
                cached: true,
                cache_similarity: cachedMatch.score,
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
          "X-Chatbot-Cache": "HIT",
        },
      });
    }

    // 5. Retrieve top-k semantic vector matches from tenant's Qdrant collection
    const retrievedChunks = await searchQdrant(queryVector, 4, 0.05, tenantId);

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
        tenantId,
      });

      // Save generated answer in semantic cache
      storeInSemanticCache(queryVector, cleanUserMessage, answer, sources, undefined, tenantId).catch(console.error);

      return NextResponse.json(
        {
          success: true,
          conversation_id: conv.id,
          tenant_id: tenantId,
          query: cleanUserMessage,
          answer,
          sources,
          total_sources_found: sources.length,
          guardrail_flags: outputGuard.flags,
          cached: false,
        },
        {
          headers: {
            "X-Chatbot-Cache": "MISS",
          },
        }
      );
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
                tenant_id: tenantId,
                sources,
                cached: false,
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
            tenantId,
          });

          // Save in semantic cache
          storeInSemanticCache(queryVector, cleanUserMessage, sanitizedAnswer, sources, undefined, tenantId).catch(console.error);

          // 5. Send completion event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                answer: sanitizedAnswer,
                guardrail_flags: finalOutputGuard.flags,
                cached: false,
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
        "X-Chatbot-Cache": "MISS",
      },
    });
    });
  } catch (err: any) {
    console.error("[Chat API Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
