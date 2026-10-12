import { factValueSchemas, type BusinessRecord } from "@/platform/business-record/contracts";
import type { BusinessFacts } from "@/products/websites/rebuild-pipeline";
import { FOUND_FACT_KEYS, FOUND_FACT_LABELS, type FoundFact, type FoundFactKey, type FoundFactSource } from "./contracts";
import { websiteLinks } from "./website";

/**
 * Found facts from a website reading: the same crawl and extraction the
 * website rebuild and the agency seed use. Only facts that fit the business
 * record are offered, each with the page and quote it came from. Nothing
 * here writes; `confirmedPatch` builds the owner's own write.
 */

const MAX_SERVICES = 12;
type RecordView = Pick<BusinessRecord, "facts" | "services">;

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "formatted" in value && typeof (value as { formatted?: unknown }).formatted === "string") return (value as { formatted: string }).formatted;
  if (value && typeof value === "object" && "line1" in value && typeof (value as { line1?: unknown }).line1 === "string") return (value as { line1: string }).line1;
  return null;
}

function parsed(key: Exclude<FoundFactKey, "service">, candidate: unknown): unknown | null {
  const result = factValueSchemas[key].safeParse(candidate);
  return result.success ? result.data : null;
}

export function foundFactsFromReading(found: BusinessFacts, record: RecordView): FoundFact[] {
  const pageUrl = new Map(found.sourcePages.map(page => [page.sourceId, page.url]));
  const sourceOf = (id: string): FoundFactSource | null => {
    const first = found.facts[id]?.sources[0];
    const url = first ? pageUrl.get(first.sourceId) : undefined;
    return first && url ? { url, quote: first.quote } : null;
  };
  const out: FoundFact[] = [];
  const seen = new Set<string>();
  const push = (key: FoundFactKey, value: unknown, source: FoundFactSource | null) => {
    const display = text(value);
    if (!display) return;
    const id = `${key}:${display.toLowerCase()}`;
    if (seen.has(id)) return;
    if (key === "service") {
      if (record.services.some(service => service.active && service.name.trim().toLowerCase() === display.trim().toLowerCase())) return;
    } else {
      const current = text(record.facts[key]?.value);
      if (current && current.trim().toLowerCase() === display.trim().toLowerCase()) return;
      if (out.some(item => item.key === key)) return;
    }
    seen.add(id);
    const current = key === "service" ? null : text(record.facts[key]?.value);
    out.push({ id, key, label: FOUND_FACT_LABELS[key], display, value, source, current: current ?? null });
  };

  if (found.name && found.nameFactId) {
    const value = parsed("display_name", found.name.trim().slice(0, 160));
    if (value) push("display_name", value, sourceOf(found.nameFactId));
  }
  for (const id of found.contact) {
    const raw = found.facts[id]?.text?.trim();
    if (!raw) continue;
    const value = raw.includes("@") ? parsed("email", raw.toLowerCase()) : parsed("phone", raw.slice(0, 40));
    if (value) push(raw.includes("@") ? "email" : "phone", value, sourceOf(id));
  }
  for (const id of found.locations) {
    const raw = found.facts[id]?.text?.trim();
    const value = raw ? parsed("address", { formatted: raw.slice(0, 200) }) : null;
    if (value) push("address", value, sourceOf(id));
  }
  for (const id of found.services) {
    if (out.filter(item => item.key === "service").length >= MAX_SERVICES) break;
    const raw = found.facts[id]?.text?.trim();
    if (raw && raw.length <= 160) push("service", raw, sourceOf(id));
  }
  return out;
}

export type ConfirmedPatch =
  | { kind: "patch"; patch: { facts?: Record<string, { value: unknown }>; services?: Array<{ op: "upsert"; name: string }> }; keys: string[] }
  | { kind: "unchanged" }
  | { kind: "invalid"; message: string };

/**
 * The owner's own write for the facts they ticked. Each value is checked
 * against the record's schema again; a service already on the record is
 * skipped. The website, when given, becomes the business's one website.
 */
export function confirmedPatch(record: RecordView, selections: Array<{ key: FoundFactKey; value: unknown }>, website?: string): ConfirmedPatch {
  const facts: Record<string, { value: unknown }> = {};
  const services: Array<{ op: "upsert"; name: string }> = [];
  const keys: string[] = [];
  for (const selection of selections) {
    if (!(FOUND_FACT_KEYS as readonly string[]).includes(selection.key)) return { kind: "invalid", message: "That detail can't be added here." };
    if (selection.key === "service") {
      const name = typeof selection.value === "string" ? selection.value.trim() : "";
      if (!name || name.length > 160) return { kind: "invalid", message: "A service name needs 1 to 160 characters." };
      const exists = record.services.some(service => service.active && service.name.trim().toLowerCase() === name.toLowerCase())
        || services.some(service => service.name.toLowerCase() === name.toLowerCase());
      if (!exists && services.length < MAX_SERVICES) services.push({ op: "upsert", name });
      continue;
    }
    if (facts[selection.key]) return { kind: "invalid", message: `Choose one ${FOUND_FACT_LABELS[selection.key].toLowerCase()}.` };
    const value = factValueSchemas[selection.key].safeParse(selection.value);
    if (!value.success) return { kind: "invalid", message: `That ${FOUND_FACT_LABELS[selection.key].toLowerCase()} isn't in a form the record accepts.` };
    if (JSON.stringify(record.facts[selection.key]?.value) === JSON.stringify(value.data)) continue;
    facts[selection.key] = { value: value.data };
    keys.push(selection.key);
  }
  if (website) {
    const links = websiteLinks(record, website);
    if (links) { facts.links = { value: links }; keys.push("links"); }
  }
  if (services.length) keys.push("services");
  if (!keys.length) return { kind: "unchanged" };
  return { kind: "patch", patch: { ...(Object.keys(facts).length ? { facts } : {}), ...(services.length ? { services } : {}) }, keys };
}
