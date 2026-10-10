import { z } from "zod";
import { factValueSchemas } from "@/platform/business-record/contracts";
import { siteDocumentSchema, type SiteDocument } from "./site-document";

export const websiteBusinessFactsSchema = z.object({ revision: z.number().int().nonnegative(), facts: z.object({
  display_name: factValueSchemas.display_name.optional(), phone: factValueSchemas.phone.optional(), email: factValueSchemas.email.optional(),
  address: factValueSchemas.address.optional(), hours: factValueSchemas.hours.optional(),
}).strict(), services: z.array(z.object({ name: z.string().max(160), description: z.string().max(2000).nullable(), priceText: z.string().max(80).nullable() }).strict()).max(40) }).strict();
export type WebsiteBusinessFacts = z.infer<typeof websiteBusinessFactsSchema>;

/** The published document declares the catalog slots it reads. It remains
 * immutable; this detached render projection never changes an issued hash,
 * fact provenance, approval, provider binding or navigation structure. */
export function projectWebsiteBusinessFacts(input: SiteDocument, record: WebsiteBusinessFacts | null): SiteDocument {
  if (!record || !input.businessRecord) return input;
  const doc = structuredClone(input);
  const { facts } = websiteBusinessFactsSchema.parse(record);
  for (const binding of doc.businessRecord!.bindings) {
    const node = doc.nodes[binding.nodeId]; if (!node) continue;
    if (binding.kind === "name" && node.type === "Header" && facts.display_name) node.props.brand = facts.display_name;
    if (binding.kind === "address" && node.type === "Map" && facts.address) node.props.address = facts.address.formatted ?? [facts.address.line1, facts.address.line2, facts.address.city, facts.address.region, facts.address.postalCode, facts.address.country].filter(Boolean).join(", ").slice(0,500);
    if (binding.kind === "hours" && node.type === "Hours" && facts.hours) {
      const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      node.props.rows = [
        ...[1,2,3,4,5,6,0].map(day => ({ day: names[day]!, hours: facts.hours!.weekly.filter(row => row.day === day).map(row => `${row.opens}–${row.closes}`).join(", ") || "Closed" })),
        ...(facts.hours.overrides ?? []).map(row => ({ day: `${row.date}${row.label ? ` (${row.label})` : ""}`, hours: row.closed ? "Closed" : `${row.opens}–${row.closes}` })),
        { day: "Timezone", hours: facts.hours.timezone },
      ];
    }
    if (binding.kind === "services" && node.type === "ServiceGrid") node.props.items = record.services.map(service => ({ title: service.name, ...(service.description ? { body: service.description } : {}) }));
    if (binding.kind === "contact") {
      // Preserve the approved label and structure; only existing contact links
      // read the confirmed destination. Arbitrary URLs are never replaced.
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const item = value as Record<string, unknown>;
        const destination = item.href;
        if (typeof destination === "string") {
          if (destination.startsWith("tel:") && facts.phone) item.href = `tel:${facts.phone.replace(/[^+\d]/g,"")}`;
          if (destination.startsWith("mailto:") && facts.email) item.href = `mailto:${facts.email}`;
        }
        Object.values(item).forEach(visit);
      };
      visit(node.props);
    }
  }
  const projected = siteDocumentSchema.safeParse(doc);
  return projected.success ? projected.data : input;
}

/** Only new candidates, under explicit rollout, acquire these read contracts.
 * The owner approves the immutable bindings with the rest of the preview. */
export function bindWebsiteBusinessRecord(document: SiteDocument, record: WebsiteBusinessFacts | null): SiteDocument {
  if (process.env.STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED !== "1" || !record || document.businessRecord) return document;
  const bindings: NonNullable<SiteDocument["businessRecord"]>["bindings"] = [];
  for (const node of Object.values(document.nodes)) {
    if (node.type === "Header" && record.facts.display_name) bindings.push({ nodeId: node.id, kind: "name" });
    if (node.type === "Map" && record.facts.address) bindings.push({ nodeId: node.id, kind: "address" });
    if (node.type === "Hours" && record.facts.hours) bindings.push({ nodeId: node.id, kind: "hours" });
    if (node.type === "ServiceGrid" && record.services.length) bindings.push({ nodeId: node.id, kind: "services" });
    if ((record.facts.phone || record.facts.email) && /"href":"(?:tel:|mailto:)/.test(JSON.stringify(node.props))) bindings.push({ nodeId: node.id, kind: "contact" });
  }
  return bindings.length ? siteDocumentSchema.parse({ ...document, businessRecord: { bindings: bindings.slice(0,100) } }) : document;
}
