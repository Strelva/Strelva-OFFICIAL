/**
 * Unified product read across the two legacy product models — the read-layer
 * "collapse" (the compatibility period of the migration to the CMS canonical).
 *
 * Prefers Model B (Collections `product`: priceCents + currency + images +
 * inStock + checkoutUrl). Falls back to legacy Model A (content-section
 * `products`: free-text price string + hosted Stripe pay-link) so a live store
 * (GLDF) keeps working while it migrates. The dashboard/AI see one shape.
 *
 * Non-destructive: this only READS both models. Migrating GLDF's data and
 * unifying the public /api/v1 product contract is a coordinated follow-up that
 * also touches the client repo.
 */
import { getContent } from "./storage";
import { listEntriesForType } from "./cms/collections-service";
import type { ContentSection, ProductsContent } from "./types";

export interface Product {
  name: string;
  description?: string;
  priceCents?: number;
  currency: string;
  imageUrl?: string;
  inStock: boolean;
  checkoutUrl?: string;
  featured?: boolean;
}

function parsePriceToCents(price: string): number | undefined {
  const n = parseFloat(String(price).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export async function getProducts(tenant: string): Promise<Product[]> {
  // Model B — the canonical Collections product type.
  try {
    const entries = await listEntriesForType(tenant, "product", { status: "published" });
    if (entries.length > 0) {
      return entries.map((e) => {
        const d = (e.data ?? {}) as Record<string, unknown>;
        const images = Array.isArray(d.images) ? (d.images as string[]) : [];
        return {
          name: String(d.name ?? e.slug ?? "Untitled"),
          description: typeof d.description === "string" ? d.description : undefined,
          priceCents: typeof d.priceCents === "number" ? d.priceCents : undefined,
          currency: typeof d.currency === "string" ? d.currency : "USD",
          imageUrl: images[0],
          inStock: d.inStock !== false,
          checkoutUrl: typeof d.checkoutUrl === "string" ? d.checkoutUrl : undefined,
        } satisfies Product;
      });
    }
  } catch {
    // fall through to the legacy model
  }

  // Model A — legacy content-section products.
  try {
    const content = (await getContent("products" as ContentSection, tenant)) as Partial<ProductsContent>;
    const items = Array.isArray(content?.products) ? content.products : [];
    return items.map((p) => ({
      name: p.name,
      description: p.description || undefined,
      priceCents: p.price ? parsePriceToCents(p.price) : undefined,
      currency: "USD",
      imageUrl: p.imageUrl || undefined,
      inStock: !p.comingSoon,
      checkoutUrl: p.stripePaymentLink || undefined,
      featured: p.featured,
    }));
  } catch {
    return [];
  }
}
