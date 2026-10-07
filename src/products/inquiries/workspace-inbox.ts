import { inquiryRecordsEnabled, inquiryRecordsRpc, InquiryRecordsError } from "@/platform/infra/inquiry-records";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { readWorkspaceLeads, type WorkspaceLeads, type LeadView } from "./linked-leads";
import { parseWorkspaceLead, type WorkspaceInquiryLead } from "./workspace-records";

export interface InboxCursor { before: string; beforeId: string }
export interface InboxDependencies {
  base: typeof readWorkspaceLeads;
  source: () => Promise<"redis" | "compare" | "postgres">;
  rpc: typeof inquiryRecordsRpc;
}
const defaults: InboxDependencies = { base: readWorkspaceLeads, source: async () => (await import("./server")).inquiryLeadReadSource(), rpc: inquiryRecordsRpc };
function view(row: WorkspaceInquiryLead): LeadView {
  return { id: row.connectedSiteId ? row.id : row.leadId, rowId: row.id, name: row.name || "Someone", email: row.email,
    message: row.message, source: row.source, fields: Object.entries(row.fields), createdAt: row.capturedAt,
    ...(row.reply ? { reply: row.reply } : {}), ...(row.intakeState === "released" ? { releasedRowId: row.id } : {}) };
}

/** The Postgres inbox pages beyond Redis's old 500-record cap, after the same
 * seven-day read gate. Flags off preserve both the reads and response shape. */
export async function readWorkspaceInquiryInbox(actor: WorkspaceActor, workspaceId: string, cursor?: InboxCursor, deps = defaults): Promise<WorkspaceLeads> {
  const base = await deps.base(actor, workspaceId);
  if (!inquiryRecordsEnabled() || await deps.source() !== "postgres") return base;
  const raw = await deps.rpc("read_workspace_inquiry_inbox_page", {
    p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    p_states: ["kept", "released"], p_limit: 100, p_before: cursor?.before ?? null, p_before_id: cursor?.beforeId ?? null,
  }, () => new WorkspaceAccessError());
  if (!Array.isArray(raw)) throw new InquiryRecordsError("failed", "inquiry_inbox_malformed");
  const rows = raw.map(parseWorkspaceLead);
  if (rows.some(row => row === null)) throw new InquiryRecordsError("failed", "inquiry_inbox_malformed");
  const page = rows as WorkspaceInquiryLead[];
  const sites = base.sites.map(site => ({ ...site, leads: page.filter(row => site.connected
    ? site.key === `connected:${row.connectedSiteId}` : row.tenantId === site.tenantId && !row.connectedSiteId).map(view) }));
  const last = page.at(-1);
  return { ...base, sites, durable: true, paged: true,
    ...(last && page.length === 100 ? { nextPage: { before: last.capturedAt, beforeId: last.id } } : {}) };
}

