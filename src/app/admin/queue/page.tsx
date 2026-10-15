import type { Metadata } from "next";
import { QueueLoadState } from "./QueueLoadState";
import { QueueView } from "./QueueView";
import { loadOperatorQueue } from "./queue-data";
import { OwnerNotToldPanel } from "./OwnerNotToldPanel";
import { OwnerReachPanel } from "./OwnerReachPanel";
import { loadOwnerNotTold, loadOwnerReach } from "../needs-you/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Queue",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * One place to operate (docs/product/specs/operator.md). Runs beside today's
 * /admin overview until the per-source counts have held for two weeks.
 */
export default async function QueuePage() {
  const [load, notTold, reach] = await Promise.all([loadOperatorQueue(), loadOwnerNotTold(), loadOwnerReach()]);
  if (load.state === "ready") {
    return <>
      <QueueView queue={load.queue} me={load.me} actionsEnabled={load.actionsEnabled} />
      <div className="mx-auto mt-4 max-w-[920px]"><OwnerNotToldPanel load={notTold} /></div>
      <div className="mx-auto mt-4 max-w-[920px]"><OwnerReachPanel load={reach} /></div>
    </>;
  }
  return <QueueLoadState state={load.state} message={load.state === "unavailable" ? load.message : undefined} />;
}
