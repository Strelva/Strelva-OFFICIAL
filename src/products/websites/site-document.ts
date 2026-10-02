import { createHash } from "node:crypto";
import { siteDocumentSchema, type SiteDocument } from "./site-document-schema";
export * from "./site-document-schema";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function siteDocumentHash(document: SiteDocument): string {
  return createHash("sha256").update(JSON.stringify(canonical(siteDocumentSchema.parse(document))), "utf8").digest("hex");
}
