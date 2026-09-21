import { load } from "cheerio";
import { z } from "zod";
import { fetchPinnedPublicText } from "@/lib/pinned-public-text";
import type { ActionReceipt } from "./contracts";
import type { InquirySurfaceSnapshot } from "./surface-contracts";

type Onboarding = InquirySurfaceSnapshot["onboarding"];
const PREFIX = "onboarding-facts-v1:";
export const SETUP_FIELD_LABELS: Record<string, string> = { website: "Website", business: "Business name", type: "Business type", location: "Location", hours: "Opening hours", staff: "Staff listed on the website", mls: "MLS" };
const factsSchema = z.object({
  website: z.string().max(2_000).nullable(),
  statements: z.array(z.object({ id: z.enum(["website", "business", "type", "location", "hours", "staff", "mls"]), label: z.string().max(80), value: z.string().max(2_000).nullable(), provenance: z.string().max(2_200).nullable(), editable: z.boolean(), confirmed: z.boolean() })).max(7),
  checks: z.array(z.object({ id: z.string().max(80), label: z.string().max(80), status: z.enum(["passed", "failed", "unknown"]), detail: z.string().max(500) })).max(3),
});

export function decodeOnboarding(value: unknown): Onboarding | undefined {
  const parsed = factsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

/** Extract explicit page evidence only. Missing business facts remain unknown. */
export function extractOnboardingFacts(html: string, website: string): Onboarding {
  const $ = load(html);
  const candidates: Record<string, unknown>[] = [];
  function visit(value: unknown, depth = 0): void {
    if (depth > 6 || candidates.length >= 100) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach((item) => visit(item, depth + 1)); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    if (types.some((type) => typeof type === "string" && /Business|Organization|Store|Restaurant|RealEstateAgent|ProfessionalService|Dentist|Lodging/.test(type))) candidates.push(item);
    if (item["@graph"]) visit(item["@graph"], depth + 1);
  }
  $('script[type="application/ld+json"]').slice(0, 25).each((_index, element) => {
    try { visit(JSON.parse($(element).text())); } catch { /* Malformed metadata is not a fact. */ }
  });
  // Several organizations on one page cannot safely be resolved by taking the first.
  const entity = candidates.length === 1 ? candidates[0] : undefined;
  const name = text(entity?.name) ?? (candidates.length === 0 ? text($('meta[property="og:site_name"]').attr("content")) : null);
  const rawKind = text(entity?.["@type"]);
  const kind = rawKind === "RealEstateAgent" ? "Real estate business" : rawKind?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? null;
  const address = entity?.address && typeof entity.address === "object" && !Array.isArray(entity.address) ? entity.address as Record<string, unknown> : null;
  const location = address ? [text(address.addressLocality), text(address.addressRegion)].filter(Boolean).join(", ") || null : null;
  const hours = Array.isArray(entity?.openingHours) ? text(entity.openingHours.slice(0, 7).map(text).filter(Boolean).join("; ")) : text(entity?.openingHours);
  const staff = Array.isArray(entity?.employee) && entity.employee.length > 0 ? `${entity.employee.length} listed; confirm the current team` : null;
  const source = `${website} · ${entity ? "structured business metadata" : "page metadata"}`;
  return {
    website,
    statements: [
      { id: "website", label: "Website", value: website, provenance: "Address supplied for this check", editable: true, confirmed: false },
      { id: "business", label: "Business name", value: name, provenance: name ? source : null, editable: true, confirmed: false },
      { id: "type", label: "Business type", value: kind, provenance: kind ? source : null, editable: true, confirmed: false },
      ...Object.entries({ location, hours, staff, mls: null }).map(([id, value]) => ({ id, label: SETUP_FIELD_LABELS[id]!, value, provenance: value ? source : null, editable: true, confirmed: false })),
    ],
    checks: [{ id: "website", label: "Website evidence", status: "passed", detail: candidates.length > 1 ? "The page describes several organizations. Confirm which business this is." : "Read public page metadata. Confirm these statements; a page claim is not independent verification." }],
  };
}

export async function readOnboardingWebsite(website: string): Promise<Onboarding> {
  const url = new URL(website);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use a public HTTP or HTTPS website address without credentials.");
  const html = await fetchPinnedPublicText(url.href, { maxBytes: 500_000, timeoutMs: 8_000, maxRedirects: 3 });
  if (html === null) return { ...extractOnboardingFacts("", url.href), checks: [{ id: "website", label: "Website evidence", status: "failed", detail: "The public website could not be read safely. Try another address or enter the facts yourself." }] };
  return extractOnboardingFacts(html, url.href);
}

export function onboardingEvidence(facts: Onboarding): string {
  return PREFIX + JSON.stringify(facts);
}

export function recordedOnboarding(receipts: ActionReceipt[]): Onboarding | null {
  let latest: Onboarding | undefined;
  for (const receipt of receipts) {
    if (receipt.action !== "onboarding_scan") continue;
    let facts = decodeOnboarding(receipt.setupFacts);
    if (!facts) {
      const evidence = receipt.evidence.find((item) => item.startsWith(PREFIX));
      try { facts = evidence ? decodeOnboarding(JSON.parse(evidence.slice(PREFIX.length))) : undefined; } catch { /* Skip malformed historical evidence. */ }
    }
    if (!facts) continue;
    latest ??= facts;
    if (facts.checks.some((check) => check.status === "failed")) continue;
    return { ...facts, checks: latest.checks };
  }
  return latest ?? null;
}

/** Accepted facts survive later reads, including failed reads. */
export function projectOnboardingCorrections(facts: Onboarding, receipts: ActionReceipt[]): Onboarding {
  const statements = facts.statements.map((statement) => ({ ...statement }));
  const seen = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.action !== "onboarding_correction" || receipt.outcome !== "recorded") continue;
    try {
      const saved = decodeOnboarding(receipt.setupFacts)?.statements[0];
      const correction = saved ? { statementId: saved.id, value: saved.value } : JSON.parse(receipt.evidence[0] ?? "null") as { statementId: string; value: string };
      if (!Object.hasOwn(SETUP_FIELD_LABELS, correction.statementId) || typeof correction.value !== "string" || seen.has(correction.statementId)) continue;
      seen.add(correction.statementId);
      let statement = statements.find((item) => item.id === correction.statementId);
      if (!statement) {
        statement = { id: correction.statementId, label: SETUP_FIELD_LABELS[correction.statementId]!, value: null, provenance: null, editable: true, confirmed: false };
        statements.push(statement);
      }
      statement.value = correction.value;
      statement.confirmed = true;
      statement.provenance = `Confirmed by an authorized user · ${receipt.createdAt}`;
    } catch { /* Ignore malformed historical evidence. */ }
  }
  return { ...facts, statements };
}
