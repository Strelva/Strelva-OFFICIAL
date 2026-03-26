import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Faq } from "@/components/public/Faq";
import { PageCTA } from "@/components/public/PageCTA";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `FAQ | ${settings.siteName}`,
    description: `Frequently asked questions about ${settings.siteName} and assisted stretching.`,
  };
}

export default async function FaqPage() {
  const tenant = await getTenantFromHeaders();
  const faq = await getContent("faq", tenant);

  return (
    <>
      <PageViewTracker />
      <main>
        <div className="pt-32 pb-10 md:pt-36 md:pb-14" style={{ background: "var(--cream)" }}>
          <div className="container-main">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight">
              {faq.headline}
            </h1>
          </div>
        </div>

        <Faq faq={faq} />
        <PageCTA />
      </main>
    </>
  );
}
