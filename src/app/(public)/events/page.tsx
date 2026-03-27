import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Events } from "@/components/public/Events";
import { PageCTA } from "@/components/public/PageCTA";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Events | ${settings.siteName}`,
    description: `Upcoming events and workshops from ${settings.siteName}.`,
  };
}

export default async function EventsPage() {
  const tenant = await getTenantFromHeaders();
  const events = await getContent("events", tenant);

  return (
    <>
      <PageViewTracker />
      <main>
        {/* Page header */}
        <div className="pt-32 pb-10 md:pt-36 md:pb-14" style={{ background: "var(--cream)" }}>
          <div className="container-main">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight">
              {events.headline}
            </h1>
          </div>
        </div>

        <Events events={events} />
        <PageCTA />
      </main>
    </>
  );
}
