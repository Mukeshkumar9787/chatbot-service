/**
 * Input and Output Guardrails for SMK Store Intelligent AI Assistant.
 *
 * Implements defensive checks for:
 * - Input: Prompt injection, jailbreaking, PII (card numbers/credentials), abuse, length limits.
 * - Output: URL validation & rewriting (e.g. preventing /profile/orders), domain whitelisting,
 *           internal credentials / API key leak redaction, and hallucination containment.
 */

export interface InputGuardrailResult {
  allowed: boolean;
  sanitizedInput: string;
  flaggedReason?: string;
  fallbackResponse?: string;
}

export interface OutputGuardrailResult {
  allowed: boolean;
  sanitizedOutput: string;
  flags: string[];
}

// -------------------------------------------------------------
// Constants & Allowed Domains
// -------------------------------------------------------------
const MAX_INPUT_LENGTH = 2000;
const STORE_BASE_URL = "https://smk-tan.vercel.app";
const CUSTOMER_ACCOUNT_URL = "https://smk-tan.vercel.app/my-account";

const ALLOWED_DOMAIN_PATTERNS = [
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*smk-tan\.vercel\.app(?:\/.*)?$/,
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*smk\.store(?:\/.*)?$/,
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*bluedart\.com(?:\/.*)?$/,
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*delhivery\.com(?:\/.*)?$/,
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*xpressbees\.com(?:\/.*)?$/,
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*dtdc\.in(?:\/.*)?$/,
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*shadowfax\.in(?:\/.*)?$/,
];

// Sensitive patterns that must never be emitted in model answers
const SENSITIVE_OUTPUT_LEAK_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/g, // Google API keys
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI/Groq keys
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, // JWT tokens
  /SupportAdmin@123/gi, // Seed admin password
  /Admin@123/gi, // Seed admin password
  /admin@smk\.internal/gi, // Internal seed admin email
  /postgres:\/\/[^\s]+/gi, // DB connection strings
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  /https:\/\/[a-zA-Z0-9.-]+\.qdrant\.io[^\s]*/gi, // Direct Qdrant Cloud URL
  /\/(?:home|var|usr|etc)\/[a-zA-Z0-9_.-]+/g, // Local server file paths
];

// -------------------------------------------------------------
// Input Guardrails
// -------------------------------------------------------------

/**
 * Validates and sanitizes user input before sending to vector search or LLM.
 */
export function validateInput(rawInput: string): InputGuardrailResult {
  const trimmed = (rawInput || "").trim();

  // 1. Empty message
  if (!trimmed) {
    return {
      allowed: false,
      sanitizedInput: "",
      flaggedReason: "EMPTY_INPUT",
      fallbackResponse: "Please enter a question so I can assist you.",
    };
  }

  // 2. Length check
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      allowed: false,
      sanitizedInput: trimmed.slice(0, MAX_INPUT_LENGTH),
      flaggedReason: "MAX_LENGTH_EXCEEDED",
      fallbackResponse: `Your message is too long (maximum ${MAX_INPUT_LENGTH} characters). Please shorten your question for the best assistance.`,
    };
  }

  // 3. Repetitive flooding / spam (e.g. "aaaaaaaaaaaa...")
  if (/(.)\1{25,}/.test(trimmed)) {
    return {
      allowed: false,
      sanitizedInput: trimmed,
      flaggedReason: "REPETITIVE_FLOODING",
      fallbackResponse: "Your message contains repetitive characters. Please enter a valid question regarding SMK Store products, orders, or policies.",
    };
  }

  // 4. Financial PII: Payment cards (13 to 19 digits)
  // Matches card sequences like 4111 1111 1111 1111 or 4111111111111111
  const cardRegex = /\b(?:\d[ -]*?){13,19}\b/;
  if (cardRegex.test(trimmed)) {
    return {
      allowed: false,
      sanitizedInput: trimmed.replace(cardRegex, "[REDACTED_CARD]"),
      flaggedReason: "PII_PAYMENT_CARD",
      fallbackResponse:
        "For your security and privacy, please do not share credit or debit card numbers in chat. Our support team will never request your full card details or banking passwords.",
    };
  }

  // 5. Prompt Injection / Jailbreaking patterns
  const injectionPatterns = [
    /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
    /disregard\s+(?:all\s+)?(?:system|prior|previous)\s+prompts?/i,
    /you\s+are\s+now\s+(?:DAN|unconstrained|jailbroken|an\s+unfiltered|developer\s+mode)/i,
    /(?:reveal|show|print|leak|repeat|output)\s+(?:the|your)?\s*(?:system\s+prompt|developer\s+instructions|secret|api\s*key)/i,
    /repeat\s+(?:everything|the\s+words)\s+above/i,
    /system\s*:\s*you\s+are/i,
    /roleplay\s+as\s+(?:an?\s+)?evil/i,
    /bypass\s+(?:all\s+)?guardrails/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        sanitizedInput: trimmed,
        flaggedReason: "PROMPT_INJECTION_ATTEMPT",
        fallbackResponse:
          "I am the SMK Store Intelligent AI Assistant. I can only assist with store merchandise, orders, tracking, returns, shipping, and official policies. I cannot modify my instructions or reveal internal configurations.",
      };
    }
  }

  // 6. Malicious / Dangerous intent
  const harmfulPatterns = [
    /\b(?:make|create|build)\s+(?:a\s+)?(?:bomb|explosive|weapon|malware|virus|ransomware)\b/i,
    /\b(?:how\s+to\s+hack|sql\s+injection\s+exploit|bypass\s+auth)\b/i,
  ];

  for (const pattern of harmfulPatterns) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        sanitizedInput: trimmed,
        flaggedReason: "HARMFUL_CONTENT",
        fallbackResponse:
          "I cannot fulfill requests of this nature. Please ask questions related to SMK Store products, shopping, returns, or order status.",
      };
    }
  }

  return {
    allowed: true,
    sanitizedInput: trimmed,
  };
}

// -------------------------------------------------------------
// Output Guardrails
// -------------------------------------------------------------

/**
 * Validates whether a URL is on the allowed store/carrier whitelist.
 */
export function isAllowedUrl(url: string): boolean {
  try {
    return ALLOWED_DOMAIN_PATTERNS.some((pattern) => pattern.test(url.trim()));
  } catch {
    return false;
  }
}

/**
 * Normalizes and corrects URLs in the generated response:
 * - Rewrites `/profile/orders`, `/profile`, `/orders` (standalone customer link), `/account/orders`
 *   to `https://smk-tan.vercel.app/my-account`.
 * - Rewrites relative internal links to absolute store links.
 * - Strips unverified third-party links or replaces them with store root.
 */
export function sanitizeUrls(text: string): { text: string; replacedUrls: string[] } {
  let result = text;
  const replacedUrls: string[] = [];

  const isInvalidAccountUrl = (u: string) => {
    const trimmed = u.trim();
    return (
      trimmed.includes("/profile/orders") ||
      trimmed.includes("/account/orders") ||
      trimmed.includes("/user/orders") ||
      trimmed === "/profile" ||
      trimmed === "https://smk-tan.vercel.app/profile" ||
      trimmed === "https://smk-tan.vercel.app/profile/" ||
      trimmed === "/orders" ||
      trimmed === "https://smk-tan.vercel.app/orders" ||
      trimmed === "https://smk-tan.vercel.app/orders/"
    );
  };

  // 1. Fix markdown links: [label](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    let cleanLabel = label.trim();
    let cleanUrl = url.trim();

    if (isInvalidAccountUrl(cleanUrl)) {
      replacedUrls.push(`${cleanUrl} -> ${CUSTOMER_ACCOUNT_URL}`);
      cleanUrl = CUSTOMER_ACCOUNT_URL;
    }

    if (isInvalidAccountUrl(cleanLabel)) {
      cleanLabel = CUSTOMER_ACCOUNT_URL;
    }

    // Relative links correction (e.g. `/my-account` -> absolute)
    if (cleanUrl.startsWith("/")) {
      cleanUrl = `${STORE_BASE_URL}${cleanUrl}`;
    } else if (!isAllowedUrl(cleanUrl)) {
      replacedUrls.push(`Unallowed domain: ${cleanUrl}`);
      cleanUrl = `${STORE_BASE_URL}/`;
    }

    return `[${cleanLabel}](${cleanUrl})`;
  });

  // 2. Fix standalone / bare URLs not enclosed in markdown syntax
  result = result.replace(/(^|[^(\[])(https?:\/\/[^\s\)\],]+)/g, (match, prefix, url) => {
    const cleanUrl = url.replace(/[.,;!?]+$/, "");
    const trailingPunctuation = url.slice(cleanUrl.length);

    if (isInvalidAccountUrl(cleanUrl)) {
      replacedUrls.push(`${cleanUrl} -> ${CUSTOMER_ACCOUNT_URL}`);
      return `${prefix}${CUSTOMER_ACCOUNT_URL}${trailingPunctuation}`;
    }

    if (!isAllowedUrl(cleanUrl)) {
      replacedUrls.push(`Unallowed bare domain: ${cleanUrl}`);
      return `${prefix}${STORE_BASE_URL}${trailingPunctuation}`;
    }

    return match;
  });

  return { text: result, replacedUrls };
}

/**
 * Redacts any leaked system secrets, tokens, or credentials from model output.
 */
export function redactSensitiveLeaks(text: string): { text: string; leaked: boolean } {
  let result = text;
  let leaked = false;

  for (const pattern of SENSITIVE_OUTPUT_LEAK_PATTERNS) {
    if (pattern.test(result)) {
      leaked = true;
      result = result.replace(pattern, "[CONFIDENTIAL]");
    }
  }

  return { text: result, leaked };
}

/**
 * Validates and sanitizes the complete model output.
 */
export function validateAndSanitizeOutput(rawOutput: string): OutputGuardrailResult {
  const flags: string[] = [];

  // 1. Redact any leaked credentials/secrets
  const leakCheck = redactSensitiveLeaks(rawOutput);
  let cleaned = leakCheck.text;
  if (leakCheck.leaked) {
    flags.push("SENSITIVE_SECRET_REDACTED");
  }

  // 2. Sanitize and normalize URLs
  const urlCheck = sanitizeUrls(cleaned);
  cleaned = urlCheck.text;
  if (urlCheck.replacedUrls.length > 0) {
    flags.push(`URLS_NORMALIZED: ${urlCheck.replacedUrls.join("; ")}`);
  }

  // 3. Fallback check for completely empty or corrupted output
  if (!cleaned.trim()) {
    flags.push("EMPTY_MODEL_OUTPUT");
    cleaned =
      "I apologize, but I could not formulate a complete answer. Please rephrase your question or reach out to customer support for assistance.";
  }

  return {
    allowed: true,
    sanitizedOutput: cleaned,
    flags,
  };
}

/**
 * Stream transformer for output guardrails:
 * Buffers chunks to avoid breaking markdown links / URLs across chunk boundaries,
 * then yields sanitized text chunks in real-time.
 */
export async function* createStreamingOutputGuardrail(
  sourceStream: AsyncGenerator<string, void, void>
): AsyncGenerator<string, string, void> {
  let buffer = "";
  let fullAccumulated = "";

  for await (const chunk of sourceStream) {
    buffer += chunk;

    // We flush buffer when safe (e.g. on newline or sentence end, but not inside a URL or markdown link)
    const urlStartIndex = buffer.search(/https?:\/\/|\[/);

    if (urlStartIndex === -1) {
      // Safe to flush up to last space
      const lastSpace = buffer.lastIndexOf(" ");
      if (lastSpace > 10) {
        const toFlush = buffer.slice(0, lastSpace);
        buffer = buffer.slice(lastSpace);
        const sanitized = sanitizeUrls(toFlush).text;
        fullAccumulated += sanitized;
        yield sanitized;
      }
    } else {
      // Wait until markdown link or URL finishes (e.g. closing parenthesis or space after URL)
      const afterUrl = buffer.slice(urlStartIndex);
      const urlDone =
        afterUrl.includes(")") ||
        afterUrl.search(/\s/) > 15 ||
        afterUrl.length > 120;

      if (urlDone) {
        const sanitized = sanitizeUrls(buffer).text;
        buffer = "";
        fullAccumulated += sanitized;
        yield sanitized;
      }
    }
  }

  // Flush any remainder
  if (buffer.length > 0) {
    const finalClean = validateAndSanitizeOutput(buffer).sanitizedOutput;
    fullAccumulated += finalClean;
    yield finalClean;
  }

  // Final full pass check
  return validateAndSanitizeOutput(fullAccumulated).sanitizedOutput;
}
