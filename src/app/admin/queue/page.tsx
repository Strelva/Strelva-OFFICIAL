import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { AdminEmpty } from "../console";
import { QueueView } from "./QueueView";
import { loadOperatorQueue } from "./queue-data";
import { OwnerNotToldPanel } from "./OwnerNotToldPanel";
import { loadOwnerNotTold } from "../needs-you/data";

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
  const [load, notTold] = await Promise.all([loadOperatorQueue(), loadOwnerNotTold()]);
  if (load.state === "ready") {
    return <>
      <QueueView queue={load.queue} me={load.me} actionsEnabled={load.actionsEnabled} />
      <div className="mx-auto mt-4 max-w-[920px]"><OwnerNotToldPanel load={notTold} /></div>
    </>;
  }
  return (
    <div className="mx-auto max-w-[920px]">
      <AdminEmpty
        icon={<ShieldAlert className="size-5" aria-hidden />}
        title={load.state === "denied" ? "Operators only" : "The queue could not be read"}
        description={load.state === "denied" ? "The queue is for Strelva operators. Sign in with a verified operator account." : load.message}
      />
    </div>
  );
}
