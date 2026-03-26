import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Shop } from "@/components/public/Shop";
import { PageCTA } from "@/components/public/PageCTA";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Shop | ${settings.siteName}`,
    description: `Recommended products, tools, and merch from ${settings.siteName}.`,
  };
}

export default async function ShopPage() {
  const tenant = await getTenantFromHeaders();
  const shop = await getContent("shop", tenant);

  return (
    <>
      <PageViewTracker />
      <main>
        <div className="pt-32 pb-10 md:pt-36 md:pb-14" style={{ background: "var(--cream)" }}>
          <div className="container-main">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight">
              {shop.headline}
            </h1>
          </div>
        </div>

        <Shop shop={shop} />
        <PageCTA />
      </main>
    </>
  );
}
