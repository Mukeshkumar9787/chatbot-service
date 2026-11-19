import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const GEMINI_TIMEOUT_MS = parseInt(
  process.env.GEMINI_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || "20000",
  10
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const FALLBACK_GEMINI_MODELS = [
  GEMINI_MODEL,
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
];

const NOT_ABLE_TO_ANSWER_MESSAGE =
  "I'm sorry, I am not able to answer right now. Please try again later or contact our customer support team for assistance.";

const SYSTEM_INSTRUCTION = `You are the SMK Store Intelligent AI Assistant.
Answer customer questions strictly, accurately, and politely using ONLY the verified context extracted from uploaded store documents below.

Rules:
1. Grounding: Rely ONLY on the provided context. Never fabricate facts, shipping periods, or policies.
2. Missing Info: If the context does not contain the answer, politely state: "I couldn't find any relevant information in the store documentation to answer your question."
3. Conversational Synthesis: Provide clean, direct, conversational, and natural answers. Synthesize the information into complete sentences rather than copying raw text.
4. No Document Citations: Do NOT include document names, filenames, citations, or references to sources.
5. Tone: Polite, helpful, and professional. Use formatting like bullet points where appropriate.
6. Valid URLs: Only use URLs explicitly mentioned in the verified context. For customer accounts, order history, returns, or order tracking, direct users to https://smk-tan.vercel.app/my-account. Never fabricate invalid URLs such as /profile/orders or /orders.`;

/**
 * Builds a Gemini-compliant multi-turn contents array with proper role alternation.
 */
function buildGeminiContents(
  history: Array<{ role: string; content: string }>,
  currentQuery: string
): Array<{ role: "user" | "model"; parts: [{ text: string }] }> {
  const contents: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];

  for (const m of history) {
    if (!m || !m.content || !m.content.trim()) continue;
    if (m.content.trim() === currentQuery.trim()) continue;

    const role: "user" | "model" =
      m.role?.toLowerCase() === "assistant" || m.role?.toLowerCase() === "model"
        ? "model"
        : "user";

    // Gemini expects the conversation to start with a user turn
    if (contents.length === 0 && role === "model") {
      continue;
    }

    // Coalesce consecutive messages with same role for strict alternation
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text += `\n\n${m.content.trim()}`;
    } else {
      contents.push({
        role,
        parts: [{ text: m.content.trim() }],
      });
    }
  }

  // Ensure conversation ends with the current user question
  const last = contents[contents.length - 1];
  if (last && last.role === "user") {
    last.parts[0].text += `\n\n${currentQuery.trim()}`;
  } else {
    contents.push({
      role: "user",
      parts: [{ text: currentQuery.trim() }],
    });
  }

  return contents;
}

/**
 * Attempts to generate a streaming answer using Google Gemini.
 */
async function* generateWithGeminiStream(
  systemInstruction: string,
  contents: Array<{ role: "user" | "model"; parts: [{ text: string }] }>
): AsyncGenerator<string, boolean, void> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith("your-") || GEMINI_API_KEY === "mock-key") {
    return false;
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const triedModels = new Set<string>();

  for (const modelName of FALLBACK_GEMINI_MODELS) {
    if (triedModels.has(modelName)) continue;
    triedModels.add(modelName);

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini ${modelName} stream timed out after ${GEMINI_TIMEOUT_MS / 1000}s`)),
          GEMINI_TIMEOUT_MS
        )
      );

      const result: any = await Promise.race([
        model.generateContentStream({ contents }),
        timeoutPromise,
      ]);

      let yieldedAny = false;
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yieldedAny = true;
          yield text;
        }
      }

      if (yieldedAny) {
        return true;
      }
    } catch (err: any) {
      if (err.message?.includes("API_KEY_SERVICE_BLOCKED") || err.message?.includes("SERVICE_DISABLED")) {
        console.warn(`[Generator] Gemini API blocked or disabled on GCP project: ${err.message}`);
        break;
      }
      console.warn(`[Generator] Gemini ${modelName} stream failed: ${err.message}. Trying next fallback.`);
    }
  }

  return false;
}

/**
 * Attempts to generate a streaming answer using OpenAI or Groq if configured.
 */
async function* generateWithOpenAIOrGroqStream(
  systemInstruction: string,
  history: Array<{ role: string; content: string }>,
  currentQuery: string
): AsyncGenerator<string, boolean, void> {
  const apiKey = OPENAI_API_KEY || GROQ_API_KEY;
  if (!apiKey || apiKey.startsWith("your-")) return false;

  const isGroq = Boolean(GROQ_API_KEY && !OPENAI_API_KEY);
  const endpoint = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

  const messages: any[] = [{ role: "system", content: systemInstruction }];

  for (const m of history) {
    if (m && m.content && m.content.trim() && m.content.trim() !== currentQuery.trim()) {
      messages.push({
        role: m.role?.toLowerCase() === "assistant" || m.role?.toLowerCase() === "model" ? "assistant" : "user",
        content: m.content.trim(),
      });
    }
  }

  messages.push({ role: "user", content: currentQuery });

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let yieldedAny = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") break;

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            yieldedAny = true;
            yield delta;
          }
        } catch {
          // ignore partial json
        }
      }
    }

    return yieldedAny;
  } catch (err: any) {
    console.warn(`[Generator] ${isGroq ? "Groq" : "OpenAI"} stream error:`, err.message);
  }

  return false;
}

export interface GroundedContextOptions {
  storeName?: string;
  supportEmail?: string;
  assistantName?: string;
}

/**
 * Main export: Generates grounded streaming conversational answers for user queries.
 * Yields text tokens in real time.
 */
export async function* generateGroundedAnswerStream(
  query: string,
  chunks: Array<{ filename: string; content: string; score: number }>,
  history: Array<{ role: string; content: string }> = [],
  contextOptions?: GroundedContextOptions
): AsyncGenerator<string, void, void> {
  const storeName = contextOptions?.storeName || "SMK Store";
  const supportEmail = contextOptions?.supportEmail || "support@smkstore.com";
  const assistantName = contextOptions?.assistantName || `${storeName} Assistant`;

  if (chunks.length === 0) {
    yield `I couldn't find any relevant information in the store documentation to answer your question.`;
    return;
  }

  const contextSegments = chunks
    .map((c, idx) => `--- Context Excerpt ${idx + 1} ---\n${c.content}`)
    .join("\n\n");

  const dynamicSystemInstruction = `You are the ${storeName} Intelligent AI Assistant (${assistantName}).
Answer customer questions strictly, accurately, and politely using ONLY the verified context extracted from uploaded store documents below.

Rules:
1. Grounding: Rely ONLY on the provided context. Never fabricate facts, shipping periods, or policies.
2. Missing Info: If the context does not contain the answer, politely state: "I couldn't find any relevant information in the store documentation to answer your question."
3. Conversational Synthesis: Provide clean, direct, conversational, and natural answers. Synthesize the information into complete sentences rather than copying raw text.
4. No Document Citations: Do NOT include document names, filenames, citations, or references to sources.
5. Tone: Polite, helpful, and professional. Use formatting like bullet points where appropriate.
6. Valid URLs: Only use URLs explicitly mentioned in the verified context. For customer accounts, order history, returns, or order tracking, direct users to https://smk-tan.vercel.app/my-account. Never fabricate invalid URLs such as /profile/orders or /orders.`;

  const systemInstructionWithContext = `${dynamicSystemInstruction}

Verified Store Knowledge Base Context:
=============================
${contextSegments}
=============================

Instructions:
Answer the user's latest query accurately using the verified store context above and keeping the flow of the conversation in mind. If the information is not in the context, politely state: "I couldn't find any relevant information in the store documentation to answer your question."`;

  const geminiContents = buildGeminiContents(history, query);

  // 1. Attempt streaming with Gemini
  try {
    let geminiSucceeded = false;
    for await (const chunk of generateWithGeminiStream(systemInstructionWithContext, geminiContents)) {
      geminiSucceeded = true;
      yield chunk;
    }
    if (geminiSucceeded) {
      return;
    }
  } catch (err: any) {
    console.warn("[Generator] Gemini stream generation failed:", err.message);
  }

  // 2. Attempt streaming with OpenAI / Groq fallback
  try {
    let altSucceeded = false;
    for await (const chunk of generateWithOpenAIOrGroqStream(systemInstructionWithContext, history, query)) {
      altSucceeded = true;
      yield chunk;
    }
    if (altSucceeded) {
      return;
    }
  } catch (err: any) {
    console.warn("[Generator] Alternative LLM stream failed:", err.message);
  }

  // 3. Fallback when LLM is offline or failing
  yield NOT_ABLE_TO_ANSWER_MESSAGE;
}

/**
 * Convenience wrapper: Generates the full grounded answer as a single string.
 */
export async function generateGroundedAnswer(
  query: string,
  chunks: Array<{ filename: string; content: string; score: number }>,
  history: Array<{ role: string; content: string }> = [],
  contextOptions?: GroundedContextOptions
): Promise<string> {
  let fullAnswer = "";
  for await (const chunk of generateGroundedAnswerStream(query, chunks, history, contextOptions)) {
    fullAnswer += chunk;
  }
  return fullAnswer.trim();
}
