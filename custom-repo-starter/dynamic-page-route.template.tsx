/**
 * TEMPLATE — copy to `src/app/[...slug]/page.tsx` (or `app/[...slug]/page.tsx`)
 * in a client repo to render ANY page from the platform's page config. New pages
 * then become a data operation (the AI/operator adds a page to the config); no
 * per-page code. The home page ("/") is served by this same catch-all via the
 * "home" key, so you can delete a hardcoded `app/page.tsx` once this is in.
 *
 * Fill in the two client-specific imports below:
 *   1. `sitePageConfigFallback` — your typed fallback SitePageConfig (used when
 *      the platform is unreachable at build/render time). Keep it minimal but
 *      valid so the site never renders blank.
 *   2. `sectionRegistry` — a `SectionRegistry` mapping each section `type` your
 *      site supports to its component (e.g. { hero: HeroSection, services: ... }).
 *      This is where your repo's real designs live.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchScaffoldPageConfig } from "./scaffold-client";
import { PageRenderer, pageKeyFromSlug } from "./PageRenderer";

// TODO(client-repo): replace these two imports with your real fallback + registry.
import { sitePageConfigFallback } from "@/lib/page-config-fallback";
import { sectionRegistry } from "@/components/section-registry";

type Params = { params: Promise<{ slug?: string[] }> };

// Regenerate at most once a minute; the revalidation webhook busts it on edits.
export const revalidate = 60;

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const config = await fetchScaffoldPageConfig(sitePageConfigFallback);
  const page = config[pageKeyFromSlug(slug)];
  if (!page) notFound();
  return <PageRenderer sections={page.sections} registry={sectionRegistry} />;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const config = await fetchScaffoldPageConfig(sitePageConfigFallback);
  const page = config[pageKeyFromSlug(slug)];
  return {
    title: page?.seo?.title,
    description: page?.seo?.description,
    openGraph: page?.seo?.ogImage ? { images: [page.seo.ogImage] } : undefined,
  };
}
