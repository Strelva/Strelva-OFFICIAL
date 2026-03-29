import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { SectionRenderer } from "@/components/public/SectionRenderer";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Contact | ${settings.siteName}`,
    description: `Get in touch with ${settings.siteName}. Find our location, hours, and contact information.`,
  };
}

export default async function ContactPage({
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
        <SectionRenderer pageSlug="contact" tenant={tenant} editMode={params.edit === "true"} />
      </main>
    </>
  );
}
