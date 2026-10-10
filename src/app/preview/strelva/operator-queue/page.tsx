import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { QueueView } from "@/app/admin/queue/QueueView";
import { QueueLoadState } from "@/app/admin/queue/QueueLoadState";
import { PREVIEW_OPERATOR, queuePreview, queuePreviewScenario } from "./fixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operator queue · Local interface preview",
  robots: { index: false, follow: false },
};

/** Local fixture only (STRELVA_UI_PREVIEW=1 in development). Actions here hit
 *  the real server actions, which refuse without an operator session. */
export default async function OperatorQueuePreviewPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { scenario } = await searchParams;
  return (
    <main data-dashboard className="min-h-screen bg-surface-base px-5 py-6 text-warm-white md:px-8 md:py-7">
      {scenario === "loading" || scenario === "denied" || scenario === "error"
        ? <QueueLoadState state={scenario === "error" ? "unavailable" : scenario} />
        : <QueueView queue={queuePreview(queuePreviewScenario(scenario))} me={PREVIEW_OPERATOR} />}
    </main>
  );
}
