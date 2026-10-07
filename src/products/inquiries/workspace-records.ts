/**
 * The workspace Inquiries read and the owner's or Strelva's review of held
 * items (inquiry 1.0 delta, C9; migration 20261009113000_inquiry_records.sql).
 * Moved from src/lib/inquiry-records.ts (Strelva Reborn section 7): the
 * capture-side writes stay there, and these calls use its bounded RPC.
 * Everyone the database refuses gets WorkspaceAccessError.
 */
import { InquiryRecordsError, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { workspaceInquiryRepliesEnabled, type WorkspaceReplyOutcome } from "./workspace-replies";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";

const denied = () => new WorkspaceAccessError();

export type IntakeState = "kept" | "held_as_spam" | "released" | "confirmed_spam";

export interface WorkspaceInquiryLead {
  id: string;
  tenantId: string | null;
  connectedSiteId?: string | null;
  leadId: string;
  name: string;
  email: string | null;
  message: string | null;
  source: string | null;
  fields: Record<string, string>;
  intakeState: IntakeState;
  heldReason: string | null;
  intakeStateAt: string | null;
  contactId: string | null;
  capturedAt: string;
  reply?: WorkspaceReplyOutcome;
}

const STATES: readonly IntakeState[] = ["kept", "held_as_spam", "released", "confirmed_spam"];

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function parseWorkspaceLead(raw: unknown): WorkspaceInquiryLead | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.leadId !== "string" || typeof r.capturedAt !== "string") return null;
  const state = STATES.includes(r.intakeState as IntakeState) ? r.intakeState as IntakeState : null;
  if (!state) return null;
  const fields = r.fields && typeof r.fields === "object" && !Array.isArray(r.fields)
    ? Object.fromEntries(Object.entries(r.fields as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>
    : {};
  return {
    id: r.id,
    tenantId: str(r.tenantId),
    ...(str(r.connectedSiteId) ? { connectedSiteId: str(r.connectedSiteId) } : {}),
    leadId: r.leadId,
    name: typeof r.name === "string" ? r.name : "",
    email: str(r.email),
    message: str(r.message),
    source: str(r.source),
    fields,
    intakeState: state,
    heldReason: str(r.heldReason),
    intakeStateAt: str(r.intakeStateAt),
    contactId: str(r.contactId),
    capturedAt: r.capturedAt,
    ...(r.reply && typeof r.reply === "object" && typeof (r.reply as Record<string, unknown>).status === "string" ? { reply: { ...(r.reply as Omit<WorkspaceReplyOutcome, "retryable">), retryable: false as const } } : {}),
  };
}

function actorArgs(actor: WorkspaceActor, workspaceId: string) {
  return { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() };
}

/** The business's inquiries in the given states, newest first. Throws WorkspaceAccessError for non-members. */
export async function readWorkspaceInquiryLeads(
  actor: WorkspaceActor,
  workspaceId: string,
  options: { states?: IntakeState[]; limit?: number; before?: string } = {},
): Promise<WorkspaceInquiryLead[]> {
  const data = await inquiryRecordsRpc(workspaceInquiryRepliesEnabled() ? "read_workspace_inquiry_leads_with_receipts" : "read_workspace_leads", {
    ...actorArgs(actor, workspaceId),
    p_states: options.states ?? null,
    p_limit: options.limit ?? 100,
    p_before: options.before ?? null,
  }, denied);
  if (!Array.isArray(data)) throw new InquiryRecordsError("failed", "inquiry_records_malformed");
  return data.map(parseWorkspaceLead).filter((lead): lead is WorkspaceInquiryLead => Boolean(lead));
}

export type HeldDecision = "release" | "confirm_spam" | "hold";

/**
 * The owner's or Strelva's review of one held item. Members and admins are
 * refused by the database (WorkspaceAccessError). Release makes it a normal
 * record; no customer email goes until it is routed.
 */
export async function decideHeldInquiry(actor: WorkspaceActor, workspaceId: string, leadRowId: string, decision: HeldDecision): Promise<{ status: "decided" | "unchanged"; lead: WorkspaceInquiryLead }> {
  const data = await inquiryRecordsRpc("decide_held_workspace_lead", { ...actorArgs(actor, workspaceId), p_lead_row_id: leadRowId, p_decision: decision }, denied) as Record<string, unknown> | null;
  const lead = parseWorkspaceLead(data?.lead);
  if (!lead || (data?.status !== "decided" && data?.status !== "unchanged")) throw new InquiryRecordsError("failed", "inquiry_records_malformed");
  return { status: data.status, lead };
}

export interface InquiryEventView {
  kind: string;
  actor: string;
  detail: Record<string, unknown>;
  at: string;
}

export async function readInquiryEvents(actor: WorkspaceActor, workspaceId: string, leadRowId: string): Promise<InquiryEventView[]> {
  const data = await inquiryRecordsRpc("read_workspace_inquiry_events", { ...actorArgs(actor, workspaceId), p_lead_row_id: leadRowId }, denied);
  if (!Array.isArray(data)) throw new InquiryRecordsError("failed", "inquiry_records_malformed");
  return data.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.kind !== "string" || typeof r.at !== "string") return [];
    return [{ kind: r.kind, actor: String(r.actor ?? ""), detail: (r.detail && typeof r.detail === "object" ? r.detail : {}) as Record<string, unknown>, at: r.at }];
  });
}
