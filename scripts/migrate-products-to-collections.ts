/**
 * Migrate a tenant's legacy Model A products (content-section "products",
 * free-text price + relative images) into Model B (the Collections CMS, the
 * canonical product type: priceCents + currency + images + inStock + checkoutUrl).
 *
 * NON-DESTRUCTIVE + idempotent: it only writes Model B entries (upsert by slug).
 * The Model A content is left untouched, so the tenant's LIVE storefront — which
 * still reads /api/v1/content/<tenant>/products — keeps working through the
 * compatibility period. getProducts() prefers Model B, so the dashboard flips to
 * the migrated data immediately. Reversible: delete the collection_entries rows.
 *
 * Run:
 *   node --env-file=.env.local --import=tsx scripts/migrate-products-to-collections.ts gldf [--dry]
 */
import { getContent } from "../src/lib/storage";
import { saveEntry, listEntriesForType } from "../src/lib/cms/collections-service";
import type { ContentSection, ProductsContent } from "../src/lib/types";

function parsePriceToCents(price: unknown): number {
  const n = parseFloat(String(price ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

async function main() {
  const tenant = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!tenant) {
    console.error("Usage: migrate-products-to-collections.ts <tenant> [--dry]");
    process.exit(1);
  }

  const content = (await getContent("products" as ContentSection, tenant)) as Partial<ProductsContent>;
  const items = Array.isArray(content?.products) ? content.products : [];
  console.log(`[migrate] ${tenant}: ${items.length} Model A product(s) found`);
  if (!items.length) {
    console.log("[migrate] nothing to migrate");
    return;
  }

  for (const p of items) {
    const slug = p.id || p.name;
    const checkoutUrl = p.stripePaymentLink?.trim();
    const data: Record<string, unknown> = {
      name: p.name,
      description: p.description || "",
      priceCents: parsePriceToCents(p.price),
      currency: "USD",
      images: p.imageUrl ? [p.imageUrl] : [],
      inStock: !p.comingSoon,
      // Only set checkoutUrl when it's a real URL — the schema rejects "".
      ...(checkoutUrl ? { checkoutUrl } : {}),
    };
    if (dry) {
      console.log(`[dry] would upsert product/${slug}:`, JSON.stringify(data));
      continue;
    }
    const res = await saveEntry({ tenant, type: "product", slug, data, status: "published", actor: "admin" });
    console.log(res.ok ? `[migrate] ✓ product/${slug}` : `[migrate] ✗ product/${slug}: ${res.error}`);
  }

  if (!dry) {
    const after = await listEntriesForType(tenant, "product", { status: "published" });
    console.log(`[migrate] ${tenant} now has ${after.length} published Model B product(s)`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  },
);
