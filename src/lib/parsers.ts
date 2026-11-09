import pdf from "pdf-parse";

/**
 * Parses files based on their extension.
 */
export async function parseFileBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    try {
      const data = await pdf(buffer);
      return data.text || "";
    } catch (err: any) {
      console.error("[Parser] Failed to parse PDF:", err);
      throw new Error(`Failed to extract text from PDF: ${err.message}`);
    }
  }

  // Plain text, Markdown, CSV, JSON
  const text = buffer.toString("utf-8");

  if (ext === "json") {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  }

  return text;
}

