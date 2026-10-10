import { z } from "zod";
import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";

const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)));
const heldSchema = z.object({ id: z.string().uuid(), workspaceId: z.string().uuid().nullable(), businessName: z.string(),
  tenantId: z.string().nullable(), connectedSiteId: z.string().uuid().nullable(), leadId: z.string(), name: z.string(),
  email: z.string().nullable(), message: z.string().nullable(), capturedAt: timestamp,
  intakeState: z.enum(["held_as_spam", "released", "confirmed_spam"]), heldReason: z.string().nullable(),
});
const noticeSchema = z.object({ id: z.string().uuid(), workspaceId: z.string().uuid().nullable(), businessName: z.string(),
  tenantId: z.string().nullable(), connectedSiteId: z.string().uuid().nullable(), inquiryId: z.string(), name: z.string(),
  at: timestamp, status: z.string(), reason: z.string().nullable(),
});
export type OperatorHeldInquiry = z.infer<typeof heldSchema>;
export type OperatorInquiryNotice = z.infer<typeof noticeSchema>;
export type InquiryReviewView = "held" | "released" | "spam" | "notices";
export const operatorNoticeReviewEnabled = () => process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1";
const identity = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
const denied = () => new WorkspaceAccessError();

export async function readOperatorInquiryReview(actor: WorkspaceActor, view: InquiryReviewView, before?: string, beforeId?: string) {
  const notices = view === "notices";
  if (notices ? !operatorNoticeReviewEnabled() : !inquiryRecordsEnabled()) return { state: "off" as const, held: [], notices: [], next: null };
  const args = { ...identity(actor), p_limit: 51, p_before: before ?? null, p_before_id: beforeId ?? null };
  const data = await inquiryRecordsRpc("read_operator_inquiry_review_audited", { ...args, p_view: view }, denied);
  const parsed = (notices ? z.array(noticeSchema) : z.array(heldSchema)).safeParse(data);
  if (!parsed.success) throw new Error("inquiry_operator_read_malformed");
  const rows = parsed.data.slice(0, 50);
  const last = rows.at(-1);
  const next = parsed.data.length > 50 && last ? { at: "at" in last ? last.at : last.capturedAt, id: last.id } : null;
  return { state: "ready" as const, held: notices ? [] : rows as OperatorHeldInquiry[], notices: notices ? rows as OperatorInquiryNotice[] : [], next };
}

export async function decideOperatorHeldInquiry(actor: WorkspaceActor, rowId: string, decision: "release" | "confirm_spam" | "hold") {
  const data = await inquiryRecordsRpc("decide_operator_held_inquiry", { ...identity(actor), p_lead_row_id: rowId, p_decision: decision }, denied);
  return z.object({ status: z.enum(["decided", "unchanged"]), state: z.enum(["released", "held_as_spam", "confirmed_spam"]) }).parse(data);
}
