import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Story } from "@/components/public/Story";
import { PageCTA } from "@/components/public/PageCTA";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `About | ${settings.siteName}`,
    description: `Learn about ${settings.ownerName || settings.siteName} and our approach to wellness.`,
  };
}

export default async function AboutPage() {
  const tenant = await getTenantFromHeaders();
  const story = await getContent("story", tenant);

  return (
    <>
      <PageViewTracker />
      <main>
        {/* Page header */}
        <div className="pt-32 pb-10 md:pt-36 md:pb-14" style={{ background: "var(--cream)" }}>
          <div className="container-main">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight">
              {story.headline.split("\n")[0]}
            </h1>
          </div>
        </div>

        <Story story={story} />
        <PageCTA />
      </main>
    </>
  );
}
