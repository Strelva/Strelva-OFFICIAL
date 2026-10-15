/**
 * What a live page says in plain words. Pure, no DOM. It reads the HTML the
 * server received, so text a builder draws in the browser is not seen.
 */
const READ_LIMIT = 2_000_000;
const MATCH_WINDOW = 300;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_match, name: string) => NAMED[name.toLowerCase()] ?? " ")
    .replace(/&#x([0-9a-f]{1,6});/gi, (match, hex: string) => codePoint(parseInt(hex, 16), match))
    .replace(/&#(\d{1,7});/g, (match, dec: string) => codePoint(parseInt(dec, 10), match));
}

function codePoint(value: number, fallback: string): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return fallback;
  try { return String.fromCodePoint(value); } catch { return fallback; }
}

function unifyCharacters(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function visiblePageText(html: string): string {
  let text = html.slice(0, READ_LIMIT)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  text = text.replace(/<[^>]*>/g, " ");
  return unifyCharacters(decodeEntities(text));
}

export function normalizeForMatch(value: string): string {
  return unifyCharacters(value).toLowerCase();
}

export function pageShowsChange(html: string, expect: { expectText: string; removeText?: string | null }): { result: "visible" | "not_visible"; matched: string | null; text: string } {
  const text = visiblePageText(html);
  const haystack = normalizeForMatch(text);
  const wanted = normalizeForMatch(expect.expectText);
  const index = wanted ? haystack.indexOf(wanted) : -1;
  const removed = expect.removeText ? normalizeForMatch(expect.removeText) : "";
  const stillThere = removed !== "" && haystack.includes(removed);
  if (index < 0 || stillThere) return { result: "not_visible", matched: null, text };
  // Case and spacing fold the same way in both strings, so the offset is a good guide into the original.
  const start = Math.max(0, Math.min(text.length, index) - Math.floor((MATCH_WINDOW - wanted.length) / 2));
  return { result: "visible", matched: text.slice(start, start + MATCH_WINDOW), text };
}
