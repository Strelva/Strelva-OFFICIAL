import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PackageCatalogFixture } from "@/experience/systems/PackageCatalogFixture";
export const dynamic = "force-dynamic";
export const metadata = { title: "Creator apps preview", robots: { index: false, follow: false } };
export default async function PackagesPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
 if (!strelvaUiPreviewEnabled()) notFound();
 const { state = "ready" } = await searchParams;
 return <main className="min-h-dvh bg-canvas px-5 py-10 text-warm-black sm:px-8"><div className="mx-auto max-w-3xl"><h1 className="mb-3 font-display text-3xl">Install an app</h1><p className="mb-8 text-sm text-gray-muted">Fictional source, business and review. This preview creates no stored work and sends no provider requests.</p><PackageCatalogFixture key={state} state={state} /></div></main>;
}
