/**
 * Server-rendered schema.org for crawlers that don't run JavaScript (#309,
 * #502). connect.js adds the same JSON-LD in the browser; AI crawlers never
 * see that. These helpers turn businessJsonLd output into markup that is in
 * the HTML itself: the public business page renders it, and an agency pastes
 * the static block into any site.
 *
 * Output is stable: keys are sorted, so the same facts always give the same
 * bytes and the same hash. The hash lets a later check tell whether a pasted
 * block still matches the confirmed facts.
 */
import { createHash } from "node:crypto";

/** The attribute that marks Strelva's pasted block (connect.js skips injecting when it is present). */
export const SCHEMA_BLOCK_ATTRIBUTE = "data-strelva-schema";
export const SCHEMA_BLOCK_VERSION = "1";

const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), "g");
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), "g");

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, sorted((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/**
 * JSON for a `<script type="application/ld+json">`. `<`, `>` and `&` are
 * escaped so no value can close the tag or open a comment, and U+2028/2029
 * so the text is also safe inside inline JavaScript. Still valid JSON.
 */
export function jsonLdScriptContent(ld: Record<string, unknown>): string {
  return JSON.stringify(sorted(ld))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATOR, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR, "\\u2029");
}

/** First 16 hex characters of SHA-256 over the script content. */
export function schemaContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

export interface SchemaBlock {
  /** The JSON inside the script tag. */
  content: string;
  hash: string;
  /** The whole tag to paste into the page's <head> (or anywhere in <body>). */
  html: string;
}

export function schemaBlock(ld: Record<string, unknown>): SchemaBlock {
  const content = jsonLdScriptContent(ld);
  const hash = schemaContentHash(content);
  return { content, hash, html: `<script type="application/ld+json" ${SCHEMA_BLOCK_ATTRIBUTE}="${SCHEMA_BLOCK_VERSION}" data-strelva-hash="${hash}">${content}</script>` };
}

export interface FoundSchemaBlock { declaredHash: string | null; content: string }

/** Strelva blocks on a fetched page, in page order. Other JSON-LD is ignored. */
export function findSchemaBlocks(html: string): FoundSchemaBlock[] {
  const found: FoundSchemaBlock[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    if (!new RegExp(`\\b${SCHEMA_BLOCK_ATTRIBUTE}\\s*=`, "i").test(attributes)) continue;
    const declared = attributes.match(/\bdata-strelva-hash\s*=\s*["']?([a-f0-9]{16})["']?/i)?.[1]?.toLowerCase() ?? null;
    found.push({ declaredHash: declared, content: (match[2] ?? "").trim() });
    if (found.length >= 5) break;
  }
  return found;
}

/**
 * What a check finds on the live page:
 * - `missing`: no Strelva block.
 * - `current`: the block matches today's confirmed facts.
 * - `outdated`: an untouched block from earlier facts. Paste the new one.
 * - `edited`: the block was changed by hand after it was pasted.
 */
export type SchemaBlockStatus = "missing" | "current" | "outdated" | "edited";

export function schemaBlockStatus(html: string, current: Pick<SchemaBlock, "hash">): SchemaBlockStatus {
  const blocks = findSchemaBlocks(html);
  if (!blocks.length) return "missing";
  if (blocks.some(block => schemaContentHash(block.content) === current.hash)) return "current";
  return blocks.every(block => block.declaredHash !== null && schemaContentHash(block.content) === block.declaredHash) ? "outdated" : "edited";
}
