const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 80;

/**
 * Splits text recursively using natural paragraph, sentence, and word boundaries.
 */
export function splitTextRecursively(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunkOverlap = DEFAULT_CHUNK_OVERLAP
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const separators = ["\n\n", "\n", ". ", "? ", "! ", " "];
  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    if (end < cleaned.length) {
      const segment = cleaned.slice(start, end);
      let bestSplit = -1;

      for (const sep of separators) {
        const lastIdx = segment.lastIndexOf(sep);
        if (lastIdx !== -1 && lastIdx > chunkSize / 3) {
          bestSplit = start + lastIdx + sep.length;
          break;
        }
      }

      if (bestSplit !== -1) {
        end = bestSplit;
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= cleaned.length) break;
    let nextStart = Math.max(end - chunkOverlap, start + 1);
    // Snap forward to avoid splitting mid-word or mid-token
    while (nextStart < end && cleaned[nextStart - 1] && !/\s/.test(cleaned[nextStart - 1])) {
      nextStart++;
    }
    start = nextStart;
  }

  return chunks;
}

export interface ChunkInfo {
  chunk_index: number;
  total_chunks: number;
  content: string;
}

export function chunkDocumentText(text: string): ChunkInfo[] {
  const rawChunks = splitTextRecursively(text);
  const total = rawChunks.length;

  return rawChunks.map((content, idx) => ({
    chunk_index: idx,
    total_chunks: total,
    content,
  }));
}

