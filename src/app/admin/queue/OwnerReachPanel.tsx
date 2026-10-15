import Link from "next/link";
import type { OperatorOwnerReachRow } from "@/platform/owner-reach/contracts";
import { classifyOperatorRow } from "@/platform/owner-reach/operator";
import type { OperatorLoad } from "../needs-you/data";
import { Chip, Panel, PanelCount } from "../console";

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const when = (value: string | null | undefined) => {
  const at = value ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? DATE.format(new Date(at)) : "";
};

/** The problem in the operator's words. */
export function ownerReachProblem(row: OperatorOwnerReachRow): string {
  const { problem } = classifyOperatorRow(row);
  switch (problem) {
    case "owner_in": return "Owner signed in";
    case "invite_pending": return `Invitation pending until ${when(row.invite?.expiresAt)}, not emailed`;
    case "staff_address": return `Owner email is a staff address${row.trusted?.staffReason ? ` (${row.trusted.staffReason})` : ""}`;
    case "proposed_waiting": return "Address added by agency, waiting for the owner to confirm";
    case "missing": return "No owner email on record";
    case "trusted_real": return "Owner email on record; client email is off";
  }
}

/**
 * Owners not reachable: businesses where no real owner email is on record,
 * or where it is on record but nothing can be sent. Read only; the operator
 * invites the owner with scripts/business-ownership.ts, not from here.
 */
export function OwnerReachPanel({ load }: { load: OperatorLoad<OperatorOwnerReachRow[]> }) {
  if (load.state === "off" || load.state === "denied") return null;
  if (load.state === "unavailable") {
    return <Panel title="Owners not reachable"><p role="status" className="border-t border-glass-border px-[18px] py-3 text-[12.5px] text-warning">{load.message}</p></Panel>;
  }
  const classified = load.value.map(row => ({ row, ...classifyOperatorRow(row) }));
  const unreachable = classified.filter(item => item.unreachable);
  const reachable = classified.filter(item => !item.unreachable);
  const item = ({ row }: { row: OperatorOwnerReachRow }) => (
    <li key={row.workspaceId} className="grid gap-1 px-[18px] py-3 text-[12.5px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
      <div>
        <p className="text-warm-white">{row.name}{row.sites.length ? ` · ${row.sites.join(", ")}` : ""}</p>
        <p className="mt-0.5 text-warning">{ownerReachProblem(row)}</p>
        {row.openDecisions ? <p className="mt-0.5 text-gray-muted">{row.openDecisions} open owner {row.openDecisions === 1 ? "decision" : "decisions"}{row.soonestLapse ? ` · next lapses ${when(row.soonestLapse)}` : ""}</p> : null}
        {row.lapsed14d ? <p className="mt-0.5 text-gray-muted">{row.lapsed14d} lapsed in the last 14 days, nothing changed</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Chip tone={row.openDecisions ? "warn" : "neutral"}>{row.openDecisions ? "Owner's call" : "No open asks"}</Chip>
        {row.sites[0] ? <Link className="text-[12px] font-medium text-gray-muted hover:text-accent" href={`/admin/clients/${encodeURIComponent(row.sites[0])}`}>Open client</Link> : null}
      </div>
    </li>
  );
  return (
    <Panel title="Owners not reachable" trailing={<PanelCount>{unreachable.length ? `${unreachable.length} ${unreachable.length === 1 ? "business" : "businesses"}` : "every owner reachable"}</PanelCount>}>
      {unreachable.length ? <ul className="divide-y divide-glass-border border-t border-glass-border">{unreachable.map(item)}</ul>
        : <p className="border-t border-glass-border px-[18px] py-3 text-[12.5px] text-gray-muted">Every owner can be reached.</p>}
      {reachable.length ? <details className="border-t border-glass-border">
        <summary className="cursor-pointer px-[18px] py-3 text-[12.5px] text-gray-muted">Reachable ({reachable.length})</summary>
        <ul className="divide-y divide-glass-border border-t border-glass-border">{reachable.map(item)}</ul>
      </details> : null}
    </Panel>
  );
}
