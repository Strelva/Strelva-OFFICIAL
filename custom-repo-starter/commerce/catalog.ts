import { getScaffoldBaseUrl, getTenantId } from "../scaffold-client";

/**
 * The canonical product catalog, read from the Strelva control plane (Model B —
 * the `product` collection: priceCents + currency + images + inStock +
 * checkoutUrl). This is the SERVER-SIDE source of truth for price and stock at
 * checkout — never trust prices the browser sends.
 */
export interface CatalogProduct {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  images: string[];
  inStock: boolean;
  checkoutUrl?: string;
}

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const base = getScaffoldBaseUrl();
  const tenant = getTenantId();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/v1/collections/${tenant}/product`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      entries?: Array<{ slug: string; data: Record<string, unknown> }>;
    };
    return (json.entries ?? []).map((e) => {
      const d = e.data ?? {};
      return {
        slug: e.slug,
        name: String(d.name ?? e.slug),
        description: typeof d.description === "string" ? d.description : "",
        priceCents: typeof d.priceCents === "number" ? d.priceCents : 0,
        currency: typeof d.currency === "string" ? d.currency : "USD",
        images: Array.isArray(d.images) ? d.images.filter((i): i is string => typeof i === "string") : [],
        inStock: d.inStock !== false,
        checkoutUrl: typeof d.checkoutUrl === "string" ? d.checkoutUrl : undefined,
      };
    });
  } catch {
    return [];
  }
}
