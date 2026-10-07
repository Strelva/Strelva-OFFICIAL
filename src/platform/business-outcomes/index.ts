/**
 * The outcome loop per business per month (money-and-data spec, part d):
 * site -> inquiry -> reply -> booking -> review, from Postgres only
 * (business_outcome_month). Every figure is `counted` or `linked`; a linked
 * figure is shown only when the database could make the join, otherwise the
 * line falls back to the plain count and claims nothing more.
 */
import type { WorkspaceActor } from "@/platform/workspaces";
import { inquiryOutcomeCountsSchema, inquiryReplyDuration } from "./inquiry-proof";

export interface OutcomeFigure { kind: "counted" | "linked"; value: number | null; reason?: string | null }

export interface BusinessOutcomeMonth {
  workspaceId: string;
  month: string;
  sites: number | null;
  visits: OutcomeFigure;
  inquiries: OutcomeFigure;
  answered: OutcomeFigure & { withinDay: number | null; averageReplySeconds?: number | null; medianReplySeconds?: number | null };
  bookings: OutcomeFigure & { native: number; legacy: number | null };
  bookingsFromInquiry: OutcomeFigure & { joins: string[] };
  reviews: OutcomeFigure;
}

export type OutcomeRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

export class BusinessOutcomeError extends Error {
  constructor(public readonly code: "denied" | "invalid" | "unavailable") { super(code); }
}

export async function readBusinessOutcomeMonth(actor: WorkspaceActor, workspaceId: string, month: string, rpc: OutcomeRpc): Promise<BusinessOutcomeMonth> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new BusinessOutcomeError("invalid");
  const { data, error } = await rpc(process.env.STRELVA_INQUIRY_OUTCOMES === "1" ? "business_outcome_month_inquiries" : "business_outcome_month", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_month: `${month}-01` });
  if (error) throw new BusinessOutcomeError(error.message?.includes("business_outcome_denied") ? "denied" : error.message?.includes("invalid") ? "invalid" : "unavailable");
  return data as BusinessOutcomeMonth;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export interface OutcomeLine {
  text: string;
  figures: { label: string; value: number; kind: "counted" | "linked" }[];
}

/**
 * The one line per business per month, e.g. "412 visits. 9 inquiries; 8
 * answered within a day. 3 bookings, 2 of them from a website inquiry. 2 new
 * reviews." Linked clauses appear only when their join returned a value.
 */
export function formatOutcomeLine(outcome: BusinessOutcomeMonth): OutcomeLine {
  const sentences: string[] = [];
  const figures: OutcomeLine["figures"] = [];
  if (outcome.visits.value !== null) {
    sentences.push(`${plural(outcome.visits.value, "visit", "visits")}.`);
    figures.push({ label: "visits", value: outcome.visits.value, kind: "counted" });
  }
  const inquiries = outcome.inquiries.value ?? 0;
  figures.push({ label: "inquiries", value: inquiries, kind: "counted" });
  let inquiry = plural(inquiries, "inquiry", "inquiries");
  if (inquiries > 0 && outcome.answered.withinDay !== null && outcome.answered.value !== null) {
    // The new cohort includes all first replies and their times. Older month
    // payloads retain the existing sentence verbatim while the flag is off.
    const measured = outcome.answered.averageReplySeconds !== undefined && outcome.answered.medianReplySeconds !== undefined;
    inquiry += measured
      ? `; ${outcome.answered.value.toLocaleString("en-US")} answered, ${outcome.answered.withinDay.toLocaleString("en-US")} within a day`
      : `; ${outcome.answered.withinDay.toLocaleString("en-US")} answered within a day`;
    figures.push({ label: "answered within a day", value: outcome.answered.withinDay, kind: "linked" });
  }
  sentences.push(`${inquiry}.`);
  if (outcome.answered.averageReplySeconds != null && outcome.answered.medianReplySeconds != null) {
    sentences.push(`First reply: ${inquiryReplyDuration(outcome.answered.averageReplySeconds)} average; ${inquiryReplyDuration(outcome.answered.medianReplySeconds)} median. Replies count when the email provider accepts them.`);
  }
  const bookings = outcome.bookings.value ?? 0;
  figures.push({ label: "bookings", value: bookings, kind: "counted" });
  let booking = plural(bookings, "booking", "bookings");
  if (bookings > 0 && outcome.bookingsFromInquiry.value !== null) {
    booking += `, ${outcome.bookingsFromInquiry.value.toLocaleString("en-US")} of them from a website inquiry`;
    figures.push({ label: "bookings from a website inquiry", value: outcome.bookingsFromInquiry.value, kind: "linked" });
  }
  sentences.push(`${booking}.`);
  if (outcome.reviews.value !== null) {
    sentences.push(`${plural(outcome.reviews.value, "new review", "new reviews")}.`);
    figures.push({ label: "new reviews", value: outcome.reviews.value, kind: "counted" });
  }
  return { text: sentences.join(" "), figures };
}

/** Weekly proof uses a half-open intake cohort, never a proxy from visits. */
export interface BusinessInquiryOutcomes {
  workspaceId: string; from: string; to: string;
  inquiries: number; answered: number; withinDay: number; unanswered: number;
  averageReplySeconds: number | null; medianReplySeconds: number | null; evidence: string;
}
export async function readBusinessInquiryOutcomes(actor: WorkspaceActor, workspaceId: string, from: string, to: string, rpc: OutcomeRpc): Promise<BusinessInquiryOutcomes> {
  if (process.env.STRELVA_INQUIRY_OUTCOMES !== "1") throw new BusinessOutcomeError("unavailable");
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)
    || Date.parse(to) - Date.parse(from) > 366 * 86400_000) throw new BusinessOutcomeError("invalid");
  const { data, error } = await rpc("business_inquiry_outcomes", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_from: from, p_to: to });
  if (error) throw new BusinessOutcomeError(error.message?.includes("denied") ? "denied" : "unavailable");
  const counts = inquiryOutcomeCountsSchema.safeParse(data);
  const scope = data as Partial<BusinessInquiryOutcomes> | null;
  if (!counts.success || !scope || scope.workspaceId !== workspaceId || typeof scope.from !== "string" || typeof scope.to !== "string"
    || Date.parse(scope.from) !== Date.parse(from) || Date.parse(scope.to) !== Date.parse(to)) throw new BusinessOutcomeError("unavailable");
  return { ...counts.data, workspaceId, from: scope.from, to: scope.to,
    evidence: "First provider acceptance; delivery and customer response are separate evidence." };
}
