/**
 * Inquiry records in Postgres (inquiry 1.0 delta, C8, C9, sections 4 and 5;
 * migration 20261009113000_inquiry_records.sql):
 *
 *   - spam held for review in `tenant_leads` (`held_as_spam`, `released`,
 *     `confirmed_spam`), beside the Redis spam pit, which is unchanged;
 *   - `inquiry_events`, the append-only history of each inquiry;
 *   - the sender added to the business's contacts after capture;
 *   - the workspace-scoped read and the owner's or Strelva's review of held items.
 *
 * Writes are off unless STRELVA_INQUIRY_RECORDS=1 (and DUAL_WRITE_PG is not
 * 0). Every write here is bounded and never throws: a visitor's submission, a
 * send or a capture never fails on it. Reads and the review are for the
 * workspace Inquiries page and raise WorkspaceAccessError for anyone the
 * database refuses.
 */
import { createHash } from "node:crypto";
import { dualWritePgEnabled } from "@/platform/infra/db/dual-write";
import { leadMirrorDb, type LeadMirrorDb } from "./lead-mirror";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";

export const INQUIRY_RECORDS_TIMEOUT_MS = 1500;
const LEAD_ID = /^lead_[A-Za-z0-9_-]{1,100}$/;

type Env = Partial<Record<string, string | undefined>>;

export function inquiryRecordsEnabled(env: Env = process.env): boolean {
  return env.STRELVA_INQUIRY_RECORDS?.trim() === "1" && dualWritePgEnabled();
}

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

let override: { db: LeadMirrorDb | null } | null = null;
/** Tests supply their own client (null = unconfigured); undefined restores the default. */
export function setInquiryRecordsDb(db: LeadMirrorDb | null | undefined): void {
  override = db === undefined ? null : { db };
}

function database(): LeadMirrorDb | null {
  if (override) return override.db;
  try {
    return leadMirrorDb();
  } catch {
    return null;
  }
}

export class InquiryRecordsError extends Error {
  constructor(readonly code: "unconfigured" | "timeout" | "invalid" | "not_found" | "not_held" | "failed", message?: string) {
    super(message ?? `inquiry_records_${code}`);
    this.name = "InquiryRecordsError";
  }
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = database();
  if (!db) throw new InquiryRecordsError("unconfigured");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = db.rpc(name, args);
  const request = typeof call.abortSignal === "function" ? call.abortSignal(controller.signal) : call;
  const timeout = new Promise<RpcResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ data: null, error: { message: "inquiry_records_timeout" } });
    }, INQUIRY_RECORDS_TIMEOUT_MS);
  });
  let result: RpcResult;
  try {
    result = await Promise.race([Promise.resolve(request), timeout]);
  } catch {
    throw new InquiryRecordsError("failed");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (result.error) {
    const detail = `${result.error.code ?? ""} ${result.error.message ?? ""}`;
    if (detail.includes("inquiry_access_denied")) throw new WorkspaceAccessError();
    if (detail.includes("inquiry_records_timeout")) throw new InquiryRecordsError("timeout");
    if (detail.includes("inquiry_record_invalid")) throw new InquiryRecordsError("invalid");
    if (detail.includes("inquiry_not_found")) throw new InquiryRecordsError("not_found");
    if (detail.includes("inquiry_not_held")) throw new InquiryRecordsError("not_held");
    throw new InquiryRecordsError("failed", detail.trim() || undefined);
  }
  return result.data;
}

function quietly<T>(label: string, tenant: string, work: () => Promise<T>, fallback: T): Promise<T> {
  return work().catch((error: unknown) => {
    console.error(`[inquiry-records] ${label} not recorded`, { tenant, error: error instanceof Error ? error.message : String(error) });
    return fallback;
  });
}

// --- Writes (never throw) ---------------------------------------------------------

export interface HeldSpamInput {
  id: string;
  reason: string;
  source?: string;
  name?: string;
  email?: string;
  message?: string;
  fields?: Record<string, string>;
  createdAt: string;
}

export type HoldOutcome = "recorded" | "exists" | "off" | "failed";

/** Hold one caught submission in tenant_leads for review. The Redis pit is the caller's. */
export async function holdSpamForReview(tenant: string, spam: HeldSpamInput): Promise<HoldOutcome> {
  if (!inquiryRecordsEnabled()) return "off";
  return quietly("held spam", tenant, async () => {
    const payload = {
      id: spam.id,
      reason: spam.reason.slice(0, 200) || "unspecified",
      ...(spam.source ? { source: spam.source.slice(0, 80) } : {}),
      ...(spam.name ? { name: spam.name.slice(0, 200) } : {}),
      ...(spam.email ? { email: spam.email.slice(0, 320) } : {}),
      ...(spam.message ? { message: spam.message.slice(0, 5000) } : {}),
      ...(spam.fields && Object.keys(spam.fields).length ? { fields: spam.fields } : {}),
      createdAt: spam.createdAt,
    };
    const data = await rpc("hold_tenant_lead_as_spam", { p_tenant_id: tenant, p_spam: payload }) as { status?: string } | null;
    return data?.status === "recorded" || data?.status === "exists" ? data.status : "failed";
  }, "failed" as HoldOutcome);
}

export type CaptureFollowUp = { status: "recorded" | "missing"; contactId: string | null; contact: "created" | "merged" | "skipped" | "none" } | { status: "off" | "failed" };

/** After a lead is kept in Postgres: its `captured` event and, in a converted business, its contact. */
export async function followUpLeadCapture(tenant: string, leadId: string): Promise<CaptureFollowUp> {
  if (!inquiryRecordsEnabled() || !LEAD_ID.test(leadId)) return { status: "off" };
  return quietly("capture follow-up", tenant, async () => {
    const data = await rpc("after_tenant_lead_capture", { p_tenant_id: tenant, p_lead_id: leadId }) as Record<string, unknown> | null;
    if (data?.status !== "recorded" && data?.status !== "missing") return { status: "failed" } as CaptureFollowUp;
    const contact = data.contact === "created" || data.contact === "merged" || data.contact === "skipped" ? data.contact : "none";
    return { status: data.status, contactId: typeof data.contactId === "string" ? data.contactId : null, contact };
  }, { status: "failed" } as CaptureFollowUp);
}

export type InquiryEventKind = "delivery" | "reply" | "timeline";

/** A best-effort Postgres copy of a delivery, reply or timeline write. Idempotent on `dedupeKey`. */
export async function copyInquiryEvent(input: {
  tenantId: string;
  inquiryId: string;
  kind: InquiryEventKind;
  actor?: "owner" | "operator" | "strelva" | "system";
  detail?: Record<string, unknown>;
  dedupeKey: string;
}): Promise<"recorded" | "exists" | "off" | "failed"> {
  if (!inquiryRecordsEnabled() || !LEAD_ID.test(input.inquiryId)) return "off";
  return quietly("inquiry event", input.tenantId, async () => {
    let detail = input.detail ?? {};
    if (JSON.stringify(detail).length > 7000) detail = { truncated: true };
    const dedupe = input.dedupeKey.length <= 200 ? input.dedupeKey : createHash("sha256").update(input.dedupeKey).digest("hex");
    const data = await rpc("record_inquiry_event", {
      p_tenant_id: input.tenantId, p_lead_id: input.inquiryId, p_kind: input.kind, p_actor: input.actor ?? "strelva",
      p_actor_id: null, p_detail: detail, p_dedupe_key: dedupe,
    }) as { status?: string } | null;
    return data?.status === "recorded" || data?.status === "exists" ? data.status : "failed";
  }, "failed" as const);
}

// --- Workspace reads and review ---------------------------------------------------

export type IntakeState = "kept" | "held_as_spam" | "released" | "confirmed_spam";

export interface WorkspaceInquiryLead {
  id: string;
  tenantId: string | null;
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
  const data = await rpc("read_workspace_leads", {
    ...actorArgs(actor, workspaceId),
    p_states: options.states ?? null,
    p_limit: options.limit ?? 100,
    p_before: options.before ?? null,
  });
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
  const data = await rpc("decide_held_workspace_lead", { ...actorArgs(actor, workspaceId), p_lead_row_id: leadRowId, p_decision: decision }) as Record<string, unknown> | null;
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
  const data = await rpc("read_workspace_inquiry_events", { ...actorArgs(actor, workspaceId), p_lead_row_id: leadRowId });
  if (!Array.isArray(data)) throw new InquiryRecordsError("failed", "inquiry_records_malformed");
  return data.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.kind !== "string" || typeof r.at !== "string") return [];
    return [{ kind: r.kind, actor: String(r.actor ?? ""), detail: (r.detail && typeof r.detail === "object" ? r.detail : {}) as Record<string, unknown>, at: r.at }];
  });
}
