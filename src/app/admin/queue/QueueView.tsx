import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { QUEUE_KIND_LABELS, type OperatorQueue } from "@/platform/operator-queue/contracts";
import { StEmpty, StHead, StMono, StPage, StRow, StRows, StSection, StState } from "@/components/ui/strelva/Kit";
import { QueueBoard } from "./QueueBoard";

/** Shared by /admin/queue and its local fixture preview. Source counts remain
 * available for the queue's parity check without competing with current work. */
export function QueueView({ queue, me, actionsEnabled = false }: { queue: OperatorQueue; me: string; actionsEnabled?: boolean }) {
  const open = queue.items.length;
  const late = queue.items.filter((item) => item.late).length;
  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.queue.label} meta={<>Support, incidents and releases only Strelva staff can do. Every action here is logged.</>}
      actions={<StMono>P1 harm now · P4 can wait</StMono>} />
    <QueueBoard queue={queue} me={me} actionsEnabled={actionsEnabled} />
    <details>
      <summary className="cursor-pointer text-[13px] text-gray-muted">Queue details · <StMono>{open}</StMono> open{late ? <> · <StMono>{late}</StMono> late</> : null} · Read <StMono>{new Date(queue.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</StMono></summary>
      <div className="mt-6 space-y-8">
        {queue.businessLeads && <StSection title="Client inquiries" meta="Last 7 days">
          {queue.businessLeads.length ? <StRows label="Client inquiry counts">{queue.businessLeads.map(summary => {
            const entries = [...queue.items, ...queue.parked].filter(item => summary.businessKey === (item.business.kind === "workspace" ? `w:${item.business.workspaceId}` : item.business.kind === "tenant" ? `t:${item.business.tenantId}` : "strelva"));
            const business = entries[0]?.business;
            const label = business && business.kind !== "strelva" ? business.name : summary.businessName;
            const unkept = entries.filter(item => item.kind === "lead_unkept").length;
            const pendingUnknown = queue.gaps.some(gap => gap.kind === "lead_unkept" && gap.source !== "Client lead counts");
            return <StRow key={summary.businessKey} title={label}
              detail={<>{summary.lastSevenDays === null ? "Inquiry count unavailable" : <><StMono>{summary.lastSevenDays}</StMono> inquiries</>}{pendingUnknown ? " · pending copies unavailable" : unkept ? <> · <StMono>{unkept}</StMono> not kept</> : null}</>} />;
          })}</StRows> : <StEmpty>No client sites are linked yet.</StEmpty>}
        </StSection>}
        <StSection title="Per-source counts" meta={queue.complete ? "All sources read" : <><StMono>{queue.gaps.length}</StMono> not read</>}>
          <StRows label="Rows read from each source and where they landed">{queue.counts.map(count => {
            const gap = queue.gaps.find(item => item.kind === count.kind && item.source !== "Client lead counts");
            return <StRow key={count.kind} title={QUEUE_KIND_LABELS[count.kind]}
              detail={gap ? <StState kind="need">Not read: {gap.reason}</StState> : <><StMono>{count.read}</StMono> read · <StMono>{count.shown}</StMono> shown · <StMono>{count.closed}</StMono> closed · <StMono>{count.snoozed}</StMono> snoozed</>} />;
          })}</StRows>
        </StSection>
      </div>
    </details>
  </StPage>;
}
