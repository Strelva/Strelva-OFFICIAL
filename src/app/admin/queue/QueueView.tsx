import { QUEUE_KIND_LABELS, type OperatorQueue } from "@/platform/operator-queue/contracts";
import { Panel, PanelCount } from "../console";
import { QueueBoard } from "./QueueBoard";

/**
 * The queue page body: header, board, and the per-source counts the two-week
 * parity check compares. Shared by /admin/queue and its local fixture preview.
 */
export function QueueView({ queue, me, actionsEnabled = false }: { queue: OperatorQueue; me: string; actionsEnabled?: boolean }) {
  const open = queue.items.length;
  const late = queue.items.filter((item) => item.late).length;
  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-medium tracking-[-0.02em] text-warm-white">Queue</h1>
          <p className="mt-1 text-[13px] text-gray-muted">
            {open} open{late ? ` · ${late} late` : ""} · ordered by harm. Every row opens the screen that works it.
          </p>
        </div>
        <span className="text-[11px] font-mono text-gray-faint">Read {new Date(queue.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
      </header>

      <QueueBoard queue={queue} me={me} actionsEnabled={actionsEnabled} />

      {queue.businessLeads && <Panel title="Client leads · last 7 days">
        <ul className="divide-y divide-glass-border border-t border-glass-border text-[13px]">
          {queue.businessLeads.map(summary => {
            const entries = [...queue.items, ...queue.parked].filter(item => summary.businessKey === (item.business.kind === "workspace" ? `w:${item.business.workspaceId}` : item.business.kind === "tenant" ? `t:${item.business.tenantId}` : "strelva"));
            const business = entries[0]?.business;
            const label = business && business.kind !== "strelva" ? business.name : summary.businessName;
            const unkept = entries.filter(item => item.kind === "lead_unkept").length;
            const pendingUnknown = queue.gaps.some(gap => gap.kind === "lead_unkept" && gap.source !== "Client lead counts");
            return <li key={summary.businessKey} className="flex flex-wrap justify-between gap-2 px-[18px] py-3">
              <span className="text-warm-white">{label}</span>
              <span className="text-gray-muted">{summary.lastSevenDays === null ? "Lead count unavailable" : `${summary.lastSevenDays} leads`}{pendingUnknown ? " · pending copies unavailable" : unkept ? ` · ${unkept} not kept` : ""}</span>
            </li>;
          })}
          {!queue.businessLeads.length && <li className="px-[18px] py-3 text-gray-muted">No client sites are linked yet.</li>}
        </ul>
      </Panel>}

      <Panel title="Per-source counts" trailing={<PanelCount>{queue.complete ? "all sources read" : `${queue.gaps.length} not read`}</PanelCount>}>
        <div className="overflow-x-auto">
          <table className="w-full border-t border-glass-border text-left text-[12px]">
            <caption className="sr-only">Rows read from each source and where they landed</caption>
            <thead className="text-gray-faint">
              <tr>
                <th scope="col" className="px-[18px] py-2 font-medium">Source</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Read</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Shown</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Closed</th>
                <th scope="col" className="px-[18px] py-2 text-right font-medium">Snoozed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border text-gray-muted tabular-nums">
              {queue.counts.map((count) => {
                const gap = queue.gaps.find((item) => item.kind === count.kind && item.source !== "Client lead counts");
                return (
                  <tr key={count.kind}>
                    <th scope="row" className="px-[18px] py-1.5 font-normal text-warm-white">{QUEUE_KIND_LABELS[count.kind]}</th>
                    {gap
                      ? <td colSpan={4} className="px-[18px] py-1.5 text-right text-warning">Not read: {gap.reason}</td>
                      : <>
                          <td className="px-2 py-1.5 text-right">{count.read}</td>
                          <td className="px-2 py-1.5 text-right">{count.shown}</td>
                          <td className="px-2 py-1.5 text-right">{count.closed}</td>
                          <td className="px-[18px] py-1.5 text-right">{count.snoozed}</td>
                        </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
