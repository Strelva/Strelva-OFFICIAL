import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { SectionRenderer } from "@/components/public/SectionRenderer";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: settings.siteName,
    description: settings.siteDescription,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await searchParams;
  const tenant = await getTenantFromHeaders();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:text-sm"
        style={{ background: "var(--sage)", color: "var(--cream)" }}
      >
        Skip to content
      </a>
      <PageViewTracker />
      <main id="main">
        <SectionRenderer
          pageSlug="home"
          tenant={tenant}
          editMode={params.edit === "true"}
        />
      </main>
    </>
  );
}
