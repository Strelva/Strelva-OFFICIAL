import { factValueSchemas, type BusinessRecord } from "@/platform/business-record/contracts";
import type { BusinessFacts } from "@/products/websites/rebuild-pipeline";
import { FOUND_FACT_LABELS, type FoundFact as StoredFoundFact } from "@/products/found-facts/contracts";
import type { FoundFact, FoundFactInput } from "./contracts";

/**
 * Found facts from a website reading: the same crawl and extraction the
 * website rebuild and the agency seed use, in the product's one Found-fact
 * shape (`foundFactInputSchema`). Only facts that fit the business record
 * and carry a source page and quote are offered. Nothing here writes: the
 * reading is staged in the one Found-fact store and the owner decides there.
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

export function foundFactsFromReading(found: BusinessFacts, record: RecordView): FoundFactInput[] {
  const pageUrl = new Map(found.sourcePages.map(page => [page.sourceId, page.url]));
  const sourceOf = (id: string) => {
    const first = found.facts[id]?.sources[0];
    const url = first ? pageUrl.get(first.sourceId) : undefined;
    return first && url && /^https?:\/\/\S+$/.test(url) && url.length <= 2048 ? { sourceUrl: url, quote: first.quote.trim().slice(0, 300) } : null;
  };
  const out: Array<FoundFactInput & { display: string }> = [];
  const fact = (key: FactKey, value: unknown, id: string) => {
    const source = sourceOf(id);
    const display = text(value);
    if (!source || !source.quote || !display || out.some(item => item.entity === "fact" && item.key === key)) return;
    const current = text(record.facts[key]?.value);
    if (same(current, display)) return;
    out.push({ entity: "fact", key, value, ...source, display });
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
    out.push({ entity: "service", value: { name }, ...source, display: name });
  }
  return out.map(({ display: _display, ...item }) => item as FoundFactInput);
}

/** A stored Found fact as the owner sees it here, compared with the record. */
export function screenFoundFact(fact: StoredFoundFact, record: RecordView): FoundFact {
  const label = fact.entity === "fact" ? FOUND_FACT_LABELS[fact.key ?? "description"] : FOUND_FACT_LABELS[fact.entity];
  let display = "";
  if (fact.entity !== "fact") display = text(fact.value) ?? "";
  else if (fact.key === "hours") display = Array.isArray((fact.value as { weekly?: unknown })?.weekly)
    ? (fact.value as { weekly: Array<{ day: number; opens: string; closes: string }> }).weekly.map(item => `${DAYS[item.day] ?? "?"} ${item.opens}–${item.closes}`).join(", ") : "";
  else if (fact.key === "links" || fact.key === "categories") display = Array.isArray(fact.value)
    ? fact.value.map(item => typeof item === "string" ? item : text((item as { url?: unknown })?.url) ?? "").filter(Boolean).join(", ") : "";
  else display = text(fact.value) ?? "";
  const current = fact.entity === "fact" && fact.key && fact.key !== "categories" && fact.key !== "hours" && fact.key !== "links"
    ? text(record.facts[fact.key]?.value) : null;
  return { ...fact, label, display, current: current && !same(current, display) ? current : null, confirmable: fact.key !== "categories" };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The value an owner's Confirm sends, when the found value alone can't be
 * written: hours take the record's time zone (or the owner's device zone),
 * links keep the record's other links. Null: confirm the found value as is.
 */
export function confirmationValue(fact: Pick<StoredFoundFact, "key" | "value">, record: RecordView, deviceTimeZone?: string): { value: unknown } | { refused: string } | null {
  if (fact.key === "hours") {
    const current = factValueSchemas.hours.safeParse(record.facts.hours?.value);
    const timezone = current.success ? current.data.timezone : deviceTimeZone;
    if (!timezone) return { refused: "Add hours in Business details, where you choose the time zone." };
    const hours = factValueSchemas.hours.safeParse({ ...(fact.value as object), timezone, ...(current.success && current.data.overrides ? { overrides: current.data.overrides } : {}) });
    return hours.success ? { value: hours.data } : { refused: "Those hours aren't in a form your business record accepts." };
  }
  if (fact.key === "links" && Array.isArray(fact.value)) {
    const current = factValueSchemas.links.safeParse(record.facts.links?.value);
    const found = fact.value as Array<{ kind?: string; url?: string }>;
    const others = current.success ? current.data.filter(link => !found.some(item => item.kind === link.kind || item.url === link.url)) : [];
    const merged = factValueSchemas.links.safeParse([...found, ...others].slice(0, 30));
    return merged.success ? { value: merged.data } : { refused: "Those links aren't in a form your business record accepts." };
  }
  return null;
}
