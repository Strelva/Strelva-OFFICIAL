import { getContent } from "@/lib/storage";
import { getTenantFromHeaders, isPreviewMode } from "@/lib/tenant";
import { SectionRenderer } from "@/components/public/SectionRenderer";
import { PageViewTracker } from "@/components/public/PageViewTracker";
import { MARKETING_URL } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || MARKETING_URL;
  const description = `Get in touch with ${settings.siteName}. Find our location, hours, and contact information.`;
  return {
    title: `Contact | ${settings.siteName}`,
    description,
    alternates: { canonical: `${siteUrl}/contact` },
    openGraph: {
      title: `Contact | ${settings.siteName}`,
      description,
      type: "website",
      url: `${siteUrl}/contact`,
    },
  };
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await searchParams;
  const tenant = await getTenantFromHeaders();
  const preview = await isPreviewMode();

  return (
    <>
      <PageViewTracker />
      <main>
        <SectionRenderer pageSlug="contact" tenant={tenant} editMode={params.edit === "true"} preview={preview} />
      </main>
    </>
  );
}
