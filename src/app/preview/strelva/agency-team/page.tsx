import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AgencyTeamPreview } from "@/experience/workspace/agency/AgencyTeamPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agency Team preview", robots: { index: false, follow: false } };
export default async function TeamPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready" } = await searchParams;
  return <main className="min-h-dvh bg-canvas px-6 py-10 text-warm-black sm:px-8"><div className="mx-auto max-w-4xl"><h1 className="mb-4 font-display text-3xl">Agency Team</h1><p className="mb-8 text-sm text-gray-muted">Fictional people and clients. Actions stay in this preview; no invitation or email is sent.</p><AgencyTeamPreview state={state} /></div></main>;
}
