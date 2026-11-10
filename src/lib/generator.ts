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
2. Missing Info: If the context does not contain the answer, politely state: "I don't have information about that in the SMK Store documentation. Please contact our customer support team for assistance."
3. Conversational Synthesis: Provide clean, direct, conversational, and natural answers. Synthesize the information into complete sentences rather than copying raw text.
4. No Document Citations: Do NOT include document names, filenames, citations, or references to sources.
5. Tone: Polite, helpful, and professional. Use formatting like bullet points where appropriate.`;

/**
 * Attempts to generate an answer using Google Gemini.
 */
async function generateWithGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith("your-") || GEMINI_API_KEY === "mock-key") {
    return null;
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const triedModels = new Set<string>();

  for (const modelName of FALLBACK_GEMINI_MODELS) {
    if (triedModels.has(modelName)) continue;
    triedModels.add(modelName);

    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini ${modelName} request timed out after ${GEMINI_TIMEOUT_MS / 1000}s`)),
          GEMINI_TIMEOUT_MS
        )
      );
      const result: any = await Promise.race([model.generateContent(prompt), timeoutPromise]);
      const text = result?.response?.text();
      if (text && text.trim()) {
        return text.trim();
      }
    } catch (err: any) {
      if (err.message?.includes("API_KEY_SERVICE_BLOCKED") || err.message?.includes("SERVICE_DISABLED")) {
        console.warn(`[Generator] Gemini API blocked or disabled on GCP project: ${err.message}`);
        break;
      }
      console.warn(`[Generator] Gemini ${modelName} call failed: ${err.message}. Trying next fallback.`);
    }
  }

  return null;
}

/**
 * Attempts to generate an answer using OpenAI or Groq if configured.
 */
async function generateWithOpenAIOrGroq(
  prompt: string,
  history: Array<{ role: string; content: string }> = []
): Promise<string | null> {
  const apiKey = OPENAI_API_KEY || GROQ_API_KEY;
  if (!apiKey || apiKey.startsWith("your-")) return null;

  const isGroq = Boolean(GROQ_API_KEY && !OPENAI_API_KEY);
  const endpoint = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

  const messages: any[] = [
    { role: "system", content: SYSTEM_INSTRUCTION },
  ];

  for (const m of history) {
    if (m && m.content && m.content.trim()) {
      messages.push({
        role: m.role?.toLowerCase() === "assistant" ? "assistant" : "user",
        content: m.content.trim(),
      });
    }
  }

  messages.push({ role: "user", content: prompt });

  try {
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Alternative LLM request timed out after ${GEMINI_TIMEOUT_MS / 1000}s`)),
        GEMINI_TIMEOUT_MS
      )
    );

    const fetchPromise = fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    const res: any = await Promise.race([fetchPromise, timeoutPromise]);
    if (res && res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return content.trim();
      }
    }
  } catch (err: any) {
    console.warn(`[Generator] ${isGroq ? "Groq" : "OpenAI"} API error:`, err.message);
  }

  return null;
}

/**
 * Main export: Generates grounded conversational answers for user queries
 * incorporating full conversation history with role context.
 */
export async function generateGroundedAnswer(
  query: string,
  chunks: Array<{ filename: string; content: string; score: number }>,
  history: Array<{ role: string; content: string }> = []
): Promise<string> {
  if (chunks.length === 0) {
    return "I couldn't find any relevant information in the store documentation to answer your question. Please contact our customer support team at support@smkstore.com for assistance.";
  }

  const contextSegments = chunks
    .map((c, idx) => `--- Context Excerpt ${idx + 1} ---\n${c.content}`)
    .join("\n\n");

  // Format full conversation history with explicit role context
  const filteredHistory = history.filter(
    (m) => m && m.content && m.content.trim() && m.content.trim() !== query.trim()
  );

  let historySection = "";
  if (filteredHistory.length > 0) {
    const formattedTurns = filteredHistory
      .map((m) => {
        const roleLabel = m.role?.toLowerCase() === "assistant" ? "Assistant" : "User";
        return `[Role: ${roleLabel}]\n${m.content.trim()}`;
      })
      .join("\n\n");

    historySection = `
Full Prior Conversation History with Role Context:
=============================
${formattedTurns}
=============================
`;
  }

  const prompt = `${SYSTEM_INSTRUCTION}

Verified Store Knowledge Base Context:
=============================
${contextSegments}
=============================
${historySection}
Current User Message:
[Role: User]
${query}

Instructions:
Consider the full conversation history above to understand any pronouns, follow-up questions, or prior context, but answer accurately using the verified store context. Provide a clear, polite, and helpful response:`;

  // 1. Attempt Gemini Generation
  try {
    const geminiAnswer = await generateWithGemini(prompt);
    if (geminiAnswer) {
      return geminiAnswer;
    }
  } catch (err: any) {
    console.warn("[Generator] Gemini generation failed:", err.message);
  }

  // 2. Attempt OpenAI or Groq if configured
  try {
    const altAnswer = await generateWithOpenAIOrGroq(prompt, filteredHistory);
    if (altAnswer) {
      return altAnswer;
    }
  } catch (err: any) {
    console.warn("[Generator] Alternative LLM generation failed:", err.message);
  }

  // 3. Fallback when LLM is not working: return clean direct message
  return NOT_ABLE_TO_ANSWER_MESSAGE;
}
