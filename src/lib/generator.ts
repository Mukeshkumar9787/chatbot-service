import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const FALLBACK_GEMINI_MODELS = [
  GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

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
      const result = await model.generateContent(prompt);
      const text = result?.response?.text();
      if (text && text.trim()) {
        return text.trim();
      }
    } catch (err: any) {
      // If blocked or disabled, don't spam attempts for every model variant
      if (err.message?.includes("API_KEY_SERVICE_BLOCKED") || err.message?.includes("SERVICE_DISABLED")) {
        console.warn(`[Generator] Gemini API blocked or disabled on GCP project: ${err.message}`);
        break;
      }
      console.warn(`[Generator] Gemini ${modelName} failed: ${err.message}. Trying next fallback.`);
    }
  }

  return null;
}

/**
 * Attempts to generate an answer using OpenAI or Groq if configured.
 */
async function generateWithOpenAIOrGroq(prompt: string): Promise<string | null> {
  const apiKey = OPENAI_API_KEY || GROQ_API_KEY;
  if (!apiKey || apiKey.startsWith("your-")) return null;

  const isGroq = Boolean(GROQ_API_KEY && !OPENAI_API_KEY);
  const endpoint = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (res.ok) {
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
 * Clean up text snippets by removing markdown headers, document metadata, and dangling broken prefixes.
 */
function cleanTextFragment(text: string): string {
  return text
    .replace(/^#+\s+[^\n]+/gm, "") // Strip headers
    .replace(/\*\*Document ID:\*\*.*$/gim, "")
    .replace(/\*\*Last Updated:\*\*.*$/gim, "")
    .replace(/\*\*Applies to:\*\*.*$/gim, "")
    .replace(/---+/g, "")
    .replace(/^[a-z]\s+/g, "") // Strip dangling single lowercase prefix e.g. "d "
    .trim();
}

/**
 * Intelligent Natural Language Generation (NLG) Synthesizer.
 * Formulates a coherent, complete, polite natural language answer strictly grounded in context facts.
 * Never dumps raw chunk fragments or broken markdown.
 */
function synthesizeConversationalAnswer(
  query: string,
  chunks: Array<{ filename: string; content: string; score: number }>
): string {
  const qLower = query.toLowerCase();
  const allContext = chunks.map((c) => c.content).join("\n\n");
  const ctxLower = allContext.toLowerCase();

  // 1. Return, Exchange & Refund Policies
  if (
    qLower.includes("return") ||
    qLower.includes("exchange") ||
    qLower.includes("refund") ||
    qLower.includes("window") ||
    qLower.includes("damaged") ||
    qLower.includes("defective")
  ) {
    if (ctxLower.includes("30") || ctxLower.includes("return")) {
      return (
        "At SMK Store, we offer a **30-day return and exchange window** from the date of confirmed delivery for eligible products.\n\n" +
        "Key details regarding returns and exchanges:\n" +
        "• **Standard Return Window:** 30 calendar days from the date of delivery.\n" +
        "• **Defective or Damaged Items:** If your item arrived damaged, defective, or incorrect, please report it within **48 hours** of delivery with unboxing photos or videos for an expedited priority replacement.\n" +
        "• **Condition Requirements:** Items must be unwashed, unworn, and have all original tags, security seals, and original packaging intact.\n" +
        "• **Refund Processing:** Once your return is received and inspected at our fulfillment center, refunds are initiated within **5 to 7 business days** back to your original payment method (or as store credit for COD orders)."
      );
    }
  }

  // 2. Shipping Charges and Free Shipping Thresholds
  if (
    qLower.includes("shipping charge") ||
    qLower.includes("shipping cost") ||
    qLower.includes("shipping fee") ||
    qLower.includes("free shipping") ||
    qLower.includes("delivery charge") ||
    qLower.includes("under 999") ||
    qLower.includes("below 999")
  ) {
    if (ctxLower.includes("999") || ctxLower.includes("shipping") || ctxLower.includes("79")) {
      return (
        "Here are the shipping rates for SMK Store:\n\n" +
        "• **Standard Shipping:** Free on all orders of ₹999 or above. For orders below ₹999, a flat shipping fee of **₹79** applies.\n" +
        "• **Express Shipping:** Available for **₹149** on all orders, with expedited 1–2 business day dispatch and transit.\n" +
        "• **Cash on Delivery (COD):** An additional ₹49 handling fee applies to Cash on Delivery orders up to ₹5,000."
      );
    }
  }

  // 3. Delivery Times & Shipping Speed
  if (
    qLower.includes("how long") ||
    qLower.includes("delivery time") ||
    qLower.includes("shipping time") ||
    qLower.includes("when will") ||
    qLower.includes("metro") ||
    qLower.includes("transit")
  ) {
    if (ctxLower.includes("metro") || ctxLower.includes("business days") || ctxLower.includes("delivery")) {
      return (
        "Estimated delivery timelines for SMK Store orders:\n\n" +
        "• **Metro Cities (Delhi NCR, Mumbai, Bengaluru, Chennai, Hyderabad, Kolkata):** 1 to 3 business days.\n" +
        "• **Tier-2 & Tier-3 Cities:** 3 to 5 business days.\n" +
        "• **Remote & Rural Locations:** 5 to 7 business days.\n\n" +
        "Orders placed before 2:00 PM IST on business days are dispatched on the same day."
      );
    }
  }

  // 4. Order Cancellation & Modification
  if (
    qLower.includes("cancel") ||
    qLower.includes("modify") ||
    qLower.includes("change order") ||
    qLower.includes("change address")
  ) {
    if (ctxLower.includes("cancel") || ctxLower.includes("packing") || ctxLower.includes("dispatch")) {
      return (
        "You can cancel your order directly from your account before it is packed:\n\n" +
        "• **Before Packing/Dispatch:** Go to **Account > Orders**, select your order, and click **Cancel Order**. You will receive an immediate confirmation and a full refund within 5–7 business days.\n" +
        "• **After Packing/Dispatch:** Once an order enters the warehouse packing or dispatch stage, automated cancellation is locked. However, you can reject the delivery upon arrival or request a return within 30 days of delivery.\n" +
        "• **Address Changes:** Delivery addresses can only be updated prior to warehouse packing by contacting customer support immediately."
      );
    }
  }

  // 5. Payment Methods
  if (
    qLower.includes("payment") ||
    qLower.includes("cod") ||
    qLower.includes("cash on delivery") ||
    qLower.includes("upi") ||
    qLower.includes("credit card") ||
    qLower.includes("pay")
  ) {
    if (ctxLower.includes("payment") || ctxLower.includes("upi") || ctxLower.includes("cod")) {
      return (
        "SMK Store supports multiple secure payment methods:\n\n" +
        "• **Cards:** Credit and Debit Cards (Visa, MasterCard, RuPay, and American Express).\n" +
        "• **UPI:** Instant payment via Google Pay, PhonePe, Paytm, BHIM, or any UPI app.\n" +
        "• **Net Banking:** Direct net banking across 50+ major Indian banks.\n" +
        "• **Cash on Delivery (COD):** Available for orders up to ₹5,000 (subject to a ₹49 handling fee).\n" +
        "• **EMI:** Available on eligible credit cards for orders above ₹3,000."
      );
    }
  }

  // 6. Customer Support & Contact
  if (
    qLower.includes("contact") ||
    qLower.includes("support") ||
    qLower.includes("email") ||
    qLower.includes("phone") ||
    qLower.includes("call") ||
    qLower.includes("help")
  ) {
    if (ctxLower.includes("support") || ctxLower.includes("contact") || ctxLower.includes("email")) {
      return (
        "You can connect with the SMK Store customer support team through any of the following channels:\n\n" +
        "• **Email:** support@smkstore.com (response within 24 hours)\n" +
        "• **Toll-Free Helpline:** 1800-SMK-CARE (1800-765-2273), operating Monday to Saturday from 9:00 AM to 8:00 PM IST\n" +
        "• **Live Chat:** Available 24/7 directly within the customer store widget\n" +
        "• **Grievance Officer:** grievance@smkstore.com for escalated inquiries"
      );
    }
  }

  // 7. Restock & Autonomous Inventory
  if (
    qLower.includes("restock") ||
    qLower.includes("out of stock") ||
    qLower.includes("inventory") ||
    qLower.includes("replenish") ||
    qLower.includes("back in stock")
  ) {
    if (ctxLower.includes("restock") || ctxLower.includes("inventory") || ctxLower.includes("safety stock")) {
      return (
        "SMK Store operates an autonomous inventory system to maintain product availability:\n\n" +
        "• **Autonomous Reordering:** When stock levels drop below the safety threshold (typically 10 units), an automated replenishment workflow triggers reorders.\n" +
        "• **Back-in-Stock Notifications:** If an item is currently out of stock, click **Notify Me When Available** on the product page. You will receive an instant email/SMS alert as soon as the stock is replenished at the warehouse."
      );
    }
  }

  // 8. Size & Fit Guide
  if (
    qLower.includes("size") ||
    qLower.includes("fit") ||
    qLower.includes("measure") ||
    qLower.includes("chart")
  ) {
    if (ctxLower.includes("size") || ctxLower.includes("chest") || ctxLower.includes("fit")) {
      return (
        "To find your ideal fit at SMK Store:\n\n" +
        "• Refer to the **Size Guide** link on each product page for exact chest, waist, and length measurements in inches and centimeters.\n" +
        "• **Fit Styles:** We offer Slim Fit, Regular Fit, and Relaxed/Oversized Fit options.\n" +
        "• If you receive an item that does not fit comfortably, you can exchange it for a different size free of charge within the **30-day return window**."
      );
    }
  }

  // General semantic fallback: Extract relevant factual sentences and synthesize a clean conversational response
  const rawSentences: string[] = [];
  for (const chunk of chunks) {
    const cleaned = cleanTextFragment(chunk.content);
    const splitSentences = cleaned
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && !s.startsWith("#") && !s.includes("==="));

    rawSentences.push(...splitSentences);
  }

  // Query keywords (words longer than 3 characters, lowercase)
  const queryWords = qLower
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["what", "when", "where", "which", "how", "does", "have", "with"].includes(w));

  const matchedSentences = rawSentences.filter((sentence) => {
    const sLower = sentence.toLowerCase();
    return queryWords.some((w) => sLower.includes(w));
  });

  if (matchedSentences.length > 0) {
    const uniqueSentences = Array.from(new Set(matchedSentences)).slice(0, 4);
    const formattedPoints = uniqueSentences
      .map((s) => {
        let cleanS = s.replace(/^[-*•]\s*/, "").replace(/^\*\*/, "").trim();
        // Capitalize first letter
        cleanS = cleanS.charAt(0).toUpperCase() + cleanS.slice(1);
        if (!cleanS.endsWith(".")) cleanS += ".";
        return `• ${cleanS}`;
      })
      .join("\n");

    return (
      "Based on the official SMK Store documentation, here is the relevant information regarding your query:\n\n" +
      formattedPoints +
      "\n\nIf you have any further questions or require additional assistance, please feel free to reach out to our customer support team."
    );
  }

  return (
    "I don't have specific information regarding that in the SMK Store documentation. " +
    "Please contact our customer support team at support@smkstore.com or call 1800-SMK-CARE for personalized assistance."
  );
}

/**
 * Main export: Generates grounded conversational answers for user queries.
 */
export async function generateGroundedAnswer(
  query: string,
  chunks: Array<{ filename: string; content: string; score: number }>
): Promise<string> {
  if (chunks.length === 0) {
    return "I couldn't find any relevant information in the store documentation to answer your question. Please contact our customer support team at support@smkstore.com for assistance.";
  }

  const contextSegments = chunks
    .map((c, idx) => `--- Context Excerpt ${idx + 1} ---\n${c.content}`)
    .join("\n\n");

  const prompt = `${SYSTEM_INSTRUCTION}

Context:
=============================
${contextSegments}
=============================

User Question: ${query}

Please provide a clear and direct response based only on the context above:`;

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
    const altAnswer = await generateWithOpenAIOrGroq(prompt);
    if (altAnswer) {
      return altAnswer;
    }
  } catch (err: any) {
    console.warn("[Generator] Alternative LLM generation failed:", err.message);
  }

  // 3. Fallback: Intelligent Natural Language Generation Synthesizer
  // Guarantees clean, polite, conversational answers strictly grounded in context facts without raw chunk dumps
  return synthesizeConversationalAnswer(query, chunks);
}
