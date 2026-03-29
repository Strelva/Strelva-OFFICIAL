import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { SectionRenderer } from "@/components/public/SectionRenderer";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Services | ${settings.siteName}`,
    description: `Assisted stretching, flexibility training, and wellness sessions at ${settings.siteName}. See pricing and book online.`,
  };
}

export default async function ServicesPage({
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
        <SectionRenderer
          pageSlug="services"
          tenant={tenant}
          editMode={params.edit === "true"}
        />
      </main>
    </>
  );
}
