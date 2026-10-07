import { businessAddress } from "@/platform/business-record/public-reader";
import type { TenantBusinessContext } from "@/platform/business-record/public-reader";
import { siteDocumentSchema, type SiteDocument } from "./site-document";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Render projection only. Issued revisions, hashes and capability bindings never change. */
export function siteWithBusinessRecord(document: SiteDocument, context: TenantBusinessContext | null): SiteDocument {
  if (!context) return document;
  const facts = context.facts;
  const name = facts.display_name || facts.legal_name;
  const address = businessAddress(facts);
  const nodes = Object.fromEntries(Object.entries(document.nodes).map(([id, node]) => {
    if (node.type === "Header" && name) return [id, { ...node, props: { ...node.props, brand: name } }];
    if (node.type === "Map" && address) return [id, { ...node, props: { ...node.props, address } }];
    if (node.type === "Hours" && facts.hours) return [id, { ...node, props: { ...node.props, rows: facts.hours.weekly.map(row => ({ day: days[row.day]!, hours: `${row.opens}–${row.closes}` })) } }];
    if (node.type === "ServiceGrid") return [id, { ...node, props: { ...node.props, items: context.services.map(service => {
      const item = node.props.items?.find(row => row.title.toLowerCase() === service.name.toLowerCase());
      return { ...item, title: service.name, body: service.description ?? "" };
    }) } }];
    return [id, node];
  }));
  const next = siteDocumentSchema.safeParse({ ...document, ...(name ? { siteName: name } : {}), nodes });
  // A record outside this catalog's bounds never takes the public site down.
  return next.success ? next.data : document;
}
