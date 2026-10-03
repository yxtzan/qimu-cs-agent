import type { KbChunk } from '../types';

export function chunkDocument(docId: string, docTitle: string, content: string, chunkSize = 300, overlap = 50): KbChunk[] {
  if (chunkSize <= overlap || overlap < 0) throw new Error('Invalid chunk size');
  const sections: { heading?: string; lines: string[] }[] = [];
  let current: { heading?: string; lines: string[] } = { lines: [] };
  const parents: string[] = [];
  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      if (current.lines.join('\n').trim()) sections.push(current);
      const level = heading[1].length;
      parents.length = level - 1;
      parents[level - 1] = heading[2];
      // Level-one headings are normally the document title; retain deeper paths.
      current = { heading: parents.slice(1).filter(Boolean).join(' / ') || undefined, lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.join('\n').trim()) sections.push(current);
  const chunks: KbChunk[] = [];
  for (const section of sections) {
    const text = Array.from(section.lines.join('\n').trim());
    for (let start = 0; start < text.length; start += chunkSize - overlap) {
      chunks.push({ id: `${docId}-${chunks.length + 1}`, docId, docTitle, heading: section.heading, text: text.slice(start, start + chunkSize).join('') });
      if (start + chunkSize >= text.length) break;
    }
  }
  return chunks;
}

export function bigrams(text: string): Set<string> {
  // Remove conversational fillers before forming character pairs. Keep words such
  // as 真丝 and 运费 intact even when the question contains 怎么/请问/可以.
  const normalized = text.toLowerCase().replace(/请问|麻烦|怎么|如何|怎样|可以|能否|一下|什么|吗|呢|的|了/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  const chars = Array.from(normalized);
  if (chars.length === 1) return new Set(chars);
  return new Set(chars.slice(0, -1).map((c, i) => c + chars[i + 1]));
}
function coverage(query: Set<string>, text: Set<string>): number {
  return query.size ? [...query].filter(pair => text.has(pair)).length / query.size : 0;
}
export function bigramScore(query: string, chunk: KbChunk): number {
  const pairs = bigrams(query);
  // Query coverage avoids penalizing a useful 300-character passage just because
  // the query is short. Heading coverage makes specific sections outrank FAQs.
  return 0.8 * coverage(pairs, bigrams(`${chunk.docTitle} ${chunk.heading ?? ''} ${chunk.text}`)) + 0.2 * coverage(pairs, bigrams(chunk.heading ?? chunk.docTitle));
}
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
