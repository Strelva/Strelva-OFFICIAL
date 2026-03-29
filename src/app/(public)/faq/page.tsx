import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { SectionRenderer } from "@/components/public/SectionRenderer";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `FAQ | ${settings.siteName}`,
    description: `Frequently asked questions about ${settings.siteName}.`,
  };
}

export default async function FaqPage({
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
        <SectionRenderer pageSlug="faq" tenant={tenant} editMode={params.edit === "true"} />
      </main>
    </>
  );
}
