/** Tenant-side read adapter. Public confirmed facts only, never an owner contact. */
import type { ContentMap, ContentSection } from "./types";
import { businessRecordReadsEnabled } from "./owner-recipient";
import { workspacePorts, type TenantBusinessContext } from "./workspace-ports";

export async function readReleasedTenantBusinessContext(tenantId: string): Promise<TenantBusinessContext | null> {
  if (!businessRecordReadsEnabled()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      workspacePorts().businessRecord().then(port => port.readTenantBusinessContext(tenantId)),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1500); }),
    ]);
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); }
}

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Request-local provenance, never serialized into the public content contract.
const nativeServices=new WeakMap<object,string>();
export function nativeBusinessServiceReference(service:object):string|null {
  return nativeServices.get(service)??null;
}
export function businessAddress(facts: TenantBusinessContext["facts"]): string | undefined {
  const address = facts.address;
  return address?.formatted || (address ? [address.line1, address.line2, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(", ") : undefined);
}

/** Overlay current facts after the content cache. Presentation remains the site's. */
export function contentWithBusinessRecord<K extends ContentSection>(section: K, data: ContentMap[K], context: TenantBusinessContext | null): ContentMap[K] {
  if (!context) return data;
  const { facts } = context;
  if (section === "settings") {
    const settings = data as ContentMap["settings"];
    return { ...settings, ...(facts.display_name || facts.legal_name ? { siteName: facts.display_name || facts.legal_name } : {}), ...(facts.description ? { siteDescription: facts.description } : {}), ...(facts.links?.find(link => link.kind === "booking") ? { bookingUrl: facts.links.find(link => link.kind === "booking")!.url } : {}) } as ContentMap[K];
  }
  if (section === "contact") {
    const address = businessAddress(facts);
    return { ...data, ...(facts.email ? { email: facts.email } : {}), ...(facts.phone ? { phone: facts.phone } : {}), ...(address ? { address } : {}), ...(facts.hours ? { hours: facts.hours.weekly.map(row => `${days[row.day]} ${row.opens}–${row.closes}`).join("; ") } : {}) } as ContentMap[K];
  }
  if (section === "services") {
    const current = data as ContentMap["services"];
    const projected={ ...current, services: context.services.map(service => {
      const existing = current.services.find(item => item.name.toLowerCase() === service.name.toLowerCase());
      const item={ id: service.id, duration: "", featured: false, who_its_for: "", booking_link: "", comingSoon: false, image_url: "", ...existing, name: service.name, description: service.description ?? "", price: service.priceText ?? "" };
      nativeServices.set(item,service.id);return item;
    }) };
    return projected as ContentMap[K];
  }
  return data;
}
