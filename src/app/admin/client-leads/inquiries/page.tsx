import { redirect } from "next/navigation";
import { z } from "zod";
import { isSuperAdmin } from "@/platform/infra/auth";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { operatorNoticeReviewEnabled, readOperatorInquiryReview } from "@/platform/operator-queue";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { OperatorInquiryReview, type InquiryReviewLoad } from "./OperatorInquiryReview";
export const dynamic = "force-dynamic";
const query = z.object({ view: z.enum(["held", "released", "spam", "notices"]).optional(), before: z.string().datetime().optional(), beforeId: z.string().uuid().optional() });
export default async function OperatorInquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isSuperAdmin())) redirect("/sign-in");
  const recordsOpen = inquiryRecordsEnabled(), noticesOpen = operatorNoticeReviewEnabled();
  if (!recordsOpen && !noticesOpen) redirect("/admin/client-leads");
  const parsed = query.safeParse(await searchParams);
  const params = parsed.success ? parsed.data : {};
  const view = params.view ?? (recordsOpen ? "held" : "notices");
  const actor = await workspaceHttpActor();
  let load: InquiryReviewLoad = { state: actor ? "unavailable" : "denied", held: [], notices: [], next: null };
  if (actor) try { load = await readOperatorInquiryReview(actor, view, params.before, params.beforeId); } catch { /* Explicit unavailable state, never an empty inbox. */ }
  return <OperatorInquiryReview load={load} view={view} recordsOpen={recordsOpen} noticesOpen={noticesOpen} />;
}
