import Link from "next/link";
import type { NotToldRow } from "@/platform/needs-you/policy";
import type { OperatorLoad } from "../needs-you/data";
import { Chip, Panel, PanelCount } from "../console";

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function when(value: string | null | undefined): string {
  const at = value ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? DATE.format(new Date(at)) : "";
}

/** Why the owner never heard, in the operator's words. */
export function notToldReason(row: NotToldRow): string {
  if (!row.recipientKnown) return "No owner email on file: add owner_recipient to the business record";
  const last = row.lastDelivery;
  if (!last) return "Not emailed yet";
  if (last.status === "bounced") return `Email bounced${last.reason ? ` (${last.reason})` : ""}`;
  if (last.status === "suppressed") {
    if (last.reason === "no_owner_recipient") return "No owner email on file";
    return `Email held back${last.reason ? ` (${last.reason.replace(/_/g, " ")})` : ""}: client email is off or not set up`;
  }
  if (last.status === "failed") return `Email failed to send${last.reason ? ` (${last.reason})` : ""}`;
  return "Not told";
}

/**
 * Owner not told (needs-you spec section 7): owner decisions whose email was
 * held back, bounced or never sent, and lapses nobody was told about. Read
 * only. An unseen ask is not an unanswered one: the operator decides whether
 * to call, and never decides for the owner.
 */
export function OwnerNotToldPanel({ load }: { load: OperatorLoad<NotToldRow[]> }) {
  if (load.state === "off" || load.state === "denied") return null;
  if (load.state === "unavailable") {
    return <Panel title="Owner not told"><p role="status" className="border-t border-glass-border px-[18px] py-3 text-[12.5px] text-warning">{load.message}</p></Panel>;
  }
  const rows = load.value;
  return (
    <Panel title="Owner not told" trailing={<PanelCount>{rows.length ? `${rows.length} asks` : "everyone told"}</PanelCount>}>
      {rows.length ? <ul className="divide-y divide-glass-border border-t border-glass-border">
        {rows.map(row => (
          <li key={row.id} className="grid gap-1 px-[18px] py-3 text-[12.5px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
            <div className="min-w-0">
              <p className="text-warm-white">{row.title}</p>
              <p className="mt-0.5 text-gray-muted">{row.businessName} · opened {when(row.openedAt)}{row.state === "expired" ? ` · lapsed ${when(row.decidedAt)}, nothing changed` : ` · lapses ${when(row.expiresAt)}`}</p>
              <p className="mt-0.5 text-warning">{notToldReason(row)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Chip tone={row.state === "expired" ? "neutral" : "warn"}>{row.state === "expired" ? "Lapsed" : "Owner's call"}</Chip>
              <Link className="text-[12px] font-medium text-gray-muted hover:text-accent" href={`/admin/needs-you?workspaceId=${encodeURIComponent(row.workspaceId)}`}>Who decides</Link>
            </div>
          </li>
        ))}
      </ul> : <p className="border-t border-glass-border px-[18px] py-3 text-[12.5px] text-gray-muted">Every open owner decision reached its owner by email.</p>}
    </Panel>
  );
}
