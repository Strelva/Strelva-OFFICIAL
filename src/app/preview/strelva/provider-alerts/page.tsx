import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ProviderAlertsPreview } from "@/experience/workspace/agency/ProviderAlertsPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Provider alerts preview", robots: { index: false, follow: false } };
export default async function ProviderAlertsPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready" } = await searchParams;
  return <main className="min-h-dvh bg-canvas px-6 py-10 text-warm-black sm:px-8"><div className="mx-auto max-w-4xl">
    <h1 className="mb-4 font-display text-3xl">Provider queue</h1>
    <p className="mb-8 text-sm text-gray-muted">Fictional client and stored alerts. This preview sends no email and performs no provider action.</p>
    <ProviderAlertsPreview state={state} />
  </div></main>;
}
