import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { QueueView } from "@/app/admin/queue/QueueView";
import { QueueLoadState } from "@/app/admin/queue/QueueLoadState";
import { OperatorFrame } from "@/experience/operations/OperatorFrame";
import { canonOperatorQueue } from "@/experience/workspace/preview/operator-queue-fixture";
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
    <OperatorFrame preview>
      {scenario === "loading" || scenario === "denied" || scenario === "error"
        ? <QueueLoadState state={scenario === "error" ? "unavailable" : scenario} />
        : <QueueView queue={scenario ? queuePreview(queuePreviewScenario(scenario)) : canonOperatorQueue()} me={PREVIEW_OPERATOR} />}
    </OperatorFrame>
  );
}
