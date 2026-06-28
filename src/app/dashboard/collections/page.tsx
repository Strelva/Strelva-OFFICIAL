import { requireDashboardView } from "@/lib/dashboard-auth";
import { getTenantConfig } from "@/lib/tenants";
import { COLLECTION_TYPES, type CollectionType } from "@/lib/cms/collection-types";
import { listEntriesForType } from "@/lib/cms/collections-service";
import { CollectionsManager } from "@/components/dashboard/CollectionsManager";

export default async function CollectionsPage() {
  const { tenant } = await requireDashboardView();

  const config = await getTenantConfig(tenant);
  const features = new Set(config?.features ?? []);
  // Show the collection types this tenant has enabled; default to blog so the
  // editor is never empty (blog is the wedge type).
  const enabled = (Object.keys(COLLECTION_TYPES) as CollectionType[]).filter((t) =>
    features.has(COLLECTION_TYPES[t].feature)
  );
  const types: CollectionType[] = enabled.length > 0 ? enabled : ["blog"];

  const initialType = types[0];
  const initialEntries = await listEntriesForType(tenant, initialType).catch(() => []);

  return (
    <CollectionsManager
      types={types}
      initialType={initialType}
      initialEntries={initialEntries.map((e) => ({
        slug: e.slug,
        status: e.status,
        data: e.data as Record<string, unknown>,
        updatedAt: e.updated_at,
      }))}
    />
  );
}
