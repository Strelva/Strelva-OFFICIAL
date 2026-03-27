import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Providers } from "@/components/public/Providers";
import { PageCTA } from "@/components/public/PageCTA";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Preferred Providers | ${settings.siteName}`,
    description: `Trusted wellness providers recommended by ${settings.siteName}.`,
  };
}

export default async function ProvidersPage() {
  const tenant = await getTenantFromHeaders();
  const [providers, settings] = await Promise.all([
    getContent("providers", tenant),
    getContent("settings", tenant),
  ]);

  return (
    <>
      <PageViewTracker />
      <main>
        {/* Page header */}
        <div className="pt-32 pb-10 md:pt-36 md:pb-14" style={{ background: "var(--cream)" }}>
          <div className="container-main">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight">
              {providers.headline}
            </h1>
            <p className="text-base md:text-lg leading-relaxed max-w-xl mt-4" style={{ color: "var(--bark-light)" }}>
              {providers.description}
            </p>
          </div>
        </div>

        <Providers providers={providers} ownerName={settings.ownerName} />
        <PageCTA
          heading="Know your body better"
          description="Explore our services and find the right fit for your wellness journey."
          ctaText="View Services"
          ctaHref="/services"
        />
      </main>
    </>
  );
}
