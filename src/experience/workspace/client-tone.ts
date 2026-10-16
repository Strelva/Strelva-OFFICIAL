/**
 * Per-client tones, after XA · AS1's sidebar (each client initial in its own
 * muted moss, clay, lake or stone tone). A business's
 * initial wears its own tone so a list of clients reads as different
 * businesses, not one repeated green tile. Stable per name; no meaning.
 */
const TONES = ["#2f5236", "#a8552d", "#4d7196", "#6f706b", "#7b5d3f", "#56653a"] as const;

export function clientTone(name: string): string {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 131 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}
