import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { SectionRenderer } from "@/components/public/SectionRenderer";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const [settings, events] = await Promise.all([
    getContent("settings", tenant),
    getContent("events", tenant),
  ]);
  return {
    title: `Events | ${settings.siteName}`,
    description: `Upcoming wellness events and workshops at ${settings.siteName}. ${events.events.length} events listed.`,
  };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await searchParams;
  const tenant = await getTenantFromHeaders();

  return (
    <>
      <PageViewTracker />
      <main>
        <SectionRenderer pageSlug="events" tenant={tenant} editMode={params.edit === "true"} />
      </main>
    </>
  );
}
