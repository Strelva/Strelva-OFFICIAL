import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { SectionRenderer } from "@/components/public/SectionRenderer";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://rohlaxwellness.com";
  const description = `Learn about ${settings.ownerName || settings.siteName} and our approach to wellness.`;
  return {
    title: `About | ${settings.siteName}`,
    description,
    alternates: { canonical: `${siteUrl}/about` },
    openGraph: {
      title: `About | ${settings.siteName}`,
      description,
      type: "website",
      url: `${siteUrl}/about`,
    },
  };
}

export default async function AboutPage({
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
        <SectionRenderer pageSlug="about" tenant={tenant} editMode={params.edit === "true"} />
      </main>
    </>
  );
}
