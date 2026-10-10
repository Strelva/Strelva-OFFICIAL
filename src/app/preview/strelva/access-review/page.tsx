import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AccessReviewPreview } from "@/experience/workspace/preview/AccessReviewPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Access review preview", robots: { index: false, follow: false } };
export default async function ReviewPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready" } = await searchParams;
  return <main className="min-h-dvh bg-canvas px-6 py-10 text-warm-black sm:px-8"><div className="mx-auto max-w-4xl"><h1 className="mb-4 font-display text-3xl">People & access review</h1><p className="mb-8 text-sm text-gray-muted">Fictional people and access. Actions stay in this preview.</p><AccessReviewPreview state={state} /></div></main>;
}
