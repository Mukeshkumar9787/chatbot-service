import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let genAI: GoogleGenerativeAI | null = null;
if (API_KEY && !API_KEY.startsWith("your-") && API_KEY !== "mock-key") {
  genAI = new GoogleGenerativeAI(API_KEY);
}

const SYSTEM_INSTRUCTION = `You are the SMK Store Intelligent AI Assistant.
Answer questions strictly, accurately, and politely using ONLY the verified context extracted from uploaded store documents below.

Rules:
1. Grounding: Rely ONLY on the provided context. Never fabricate facts, shipping periods, or policies.
2. Missing Info: If the context does not contain the answer, politely state: "I don't have information about that in the store documentation. Please contact customer support."
3. Clean Direct Response: Provide clean, direct, and conversational answers. Do NOT include document names, filenames, citations, or references to sources.
4. Tone: Concise, helpful, and professional. Use formatting like bullet points where appropriate.`;

export async function generateGroundedAnswer(
  query: string,
  chunks: Array<{ filename: string; content: string; score: number }>
): Promise<string> {
  if (chunks.length === 0) {
    return "I couldn't find any relevant information to answer your question. Please contact customer support for assistance.";
  }

  const contextSegments = chunks
    .map(
      (c, idx) =>
        `--- Context Excerpt ${idx + 1} ---\n${c.content}`
    )
    .join("\n\n");

  const prompt = `${SYSTEM_INSTRUCTION}

Context:
=============================
${contextSegments}
=============================

User Question: ${query}

Please provide a clear and direct response based only on the context above:`;

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim()) {
        return text.trim();
      }
    } catch (err: any) {
      console.warn("[Generator] Gemini text generation warning:", err.message, "Falling back to local answer.");
    }
  }

  // Local fallback response generator (clean, without source citations)
  const topDoc = chunks[0];
  return topDoc.content.trim();
}

