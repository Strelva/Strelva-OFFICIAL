import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { CalendarDisconnectPreview } from "@/experience/scheduling/CalendarDisconnectPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar disconnect preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  return <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6"><div className="mx-auto max-w-3xl"><p className="mb-4 text-sm text-gray-muted">Fictional calendar connection. No provider or account change is sent.</p><CalendarDisconnectPreview state={state ?? "on"} /></div></main>;
}
