import { factValueSchemas, type BusinessRecord } from "@/platform/business-record/contracts";
import type { BusinessFacts } from "@/products/websites/rebuild-pipeline";
import { FOUND_FACT_LABELS, type FoundFact, type FoundFactInput } from "./contracts";
import { websiteLinks } from "./website";

/**
 * Found facts from a website reading: the same crawl and extraction the
 * website rebuild and the agency seed use, in the product's one Found-fact
 * shape (lane L3's `foundFactInputSchema`). Only facts that fit the business
 * record and carry a source page and quote are offered. Nothing here writes;
 * `confirmedPatch` builds the owner's own write.
 */

const MAX_SERVICES = 12;
type RecordView = Pick<BusinessRecord, "facts" | "services">;
type FactKey = "phone" | "email" | "address";

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as { formatted?: unknown; line1?: unknown; name?: unknown };
    for (const candidate of [item.formatted, item.line1, item.name]) if (typeof candidate === "string") return candidate;
  }
  return null;
}

function parsed(key: FactKey, candidate: unknown): unknown | null {
  const result = factValueSchemas[key].safeParse(candidate);
  return result.success ? result.data : null;
}

const same = (left: string | null, right: string | null) => Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
const hasService = (record: RecordView, name: string) => record.services.some(service => service.active && same(service.name, name));

export function foundFactsFromReading(found: BusinessFacts, record: RecordView): FoundFact[] {
  const pageUrl = new Map(found.sourcePages.map(page => [page.sourceId, page.url]));
  const sourceOf = (id: string) => {
    const first = found.facts[id]?.sources[0];
    const url = first ? pageUrl.get(first.sourceId) : undefined;
    return first && url && /^https?:\/\/\S+$/.test(url) && url.length <= 2048 ? { sourceUrl: url, quote: first.quote.trim().slice(0, 300) } : null;
  };
  const out: FoundFact[] = [];
  const fact = (key: FactKey, value: unknown, id: string) => {
    const source = sourceOf(id);
    const display = text(value);
    if (!source || !source.quote || !display || out.some(item => item.entity === "fact" && item.key === key)) return;
    const current = text(record.facts[key]?.value);
    if (same(current, display)) return;
    out.push({ entity: "fact", key, value, ...source, id: `${key}:${display.toLowerCase()}`, label: FOUND_FACT_LABELS[key], display, current: current ?? null });
  };
  for (const id of found.contact) {
    const raw = found.facts[id]?.text?.trim();
    if (!raw) continue;
    const key = raw.includes("@") ? "email" : "phone";
    const value = parsed(key, key === "email" ? raw.toLowerCase() : raw.slice(0, 40));
    if (value) fact(key, value, id);
  }
  for (const id of found.locations) {
    const raw = found.facts[id]?.text?.trim();
    const value = raw ? parsed("address", { formatted: raw.slice(0, 200) }) : null;
    if (value) fact("address", value, id);
  }
  for (const id of found.services) {
    if (out.filter(item => item.entity === "service").length >= MAX_SERVICES) break;
    const name = found.facts[id]?.text?.trim();
    const source = sourceOf(id);
    if (!name || name.length > 160 || !source || hasService(record, name) || out.some(item => item.entity === "service" && same(item.display, name))) continue;
    out.push({ entity: "service", value: { name }, ...source, id: `service:${name.toLowerCase()}`, label: FOUND_FACT_LABELS.service, display: name, current: null });
  }
  return out;
}

export type ConfirmedPatch =
  | { kind: "patch"; patch: { facts?: Record<string, { value: unknown }>; services?: Array<{ op: "upsert"; name: string }>; people?: Array<{ op: "upsert"; name: string }> }; keys: string[] }
  | { kind: "unchanged" }
  | { kind: "invalid"; message: string };

/**
 * The owner's own write for the Found facts they ticked. Each value is checked
 * against the record's schema again; a service already on the record is
 * skipped. Hours need a time zone the owner supplies, so they are refused
 * here (the reader never offers them). The website, when given, becomes the
 * business's one website.
 */
export function confirmedPatch(record: RecordView, selections: FoundFactInput[], website?: string): ConfirmedPatch {
  const facts: Record<string, { value: unknown }> = {};
  const services: Array<{ op: "upsert"; name: string }> = [];
  const people: Array<{ op: "upsert"; name: string }> = [];
  const keys: string[] = [];
  for (const selection of selections) {
    if (selection.entity !== "fact") {
      const list = selection.entity === "service" ? services : people;
      const name = selection.value.name.trim();
      const exists = (selection.entity === "service" && hasService(record, name)) || list.some(item => same(item.name, name));
      if (!exists && list.length < MAX_SERVICES) list.push({ op: "upsert", name });
      continue;
    }
    if (selection.key === "hours") return { kind: "invalid", message: "Add hours in Business details, where you choose the time zone." };
    if (facts[selection.key]) return { kind: "invalid", message: `Choose one ${FOUND_FACT_LABELS[selection.key].toLowerCase()}.` };
    const value = factValueSchemas[selection.key].safeParse(selection.value);
    if (!value.success) return { kind: "invalid", message: `That ${FOUND_FACT_LABELS[selection.key].toLowerCase()} isn't in a form the record accepts.` };
    if (JSON.stringify(record.facts[selection.key]?.value) === JSON.stringify(value.data)) continue;
    facts[selection.key] = { value: value.data };
    keys.push(selection.key);
  }
  if (website && !facts.links) {
    const links = websiteLinks(record, website);
    if (links) { facts.links = { value: links }; keys.push("links"); }
  }
  if (services.length) keys.push("services");
  if (people.length) keys.push("people");
  if (!keys.length) return { kind: "unchanged" };
  return { kind: "patch", patch: { ...(Object.keys(facts).length ? { facts } : {}), ...(services.length ? { services } : {}), ...(people.length ? { people } : {}) }, keys };
}
