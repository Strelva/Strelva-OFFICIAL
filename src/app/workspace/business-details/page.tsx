import { recordGoogleApprovalPolicyEnabled } from "@/products/publishing/server";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { recordGoogleApprovalCopy } from "@/products/publishing/server";
import type { Metadata } from "next";
import { isSuperAdmin } from "@/platform/infra/auth";
import { readBusinessRecord } from "@/platform/business-record/service";
import { EDITABLE_DETAILS, type EditableDetail } from "@/platform/business-record/details";
import type { DetailsSaveOutcome } from "@/platform/business-record/details-save";
import { readLinkedSites } from "@/platform/owner-entry/linked-sites";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { WorkspaceBusinessDetails } from "@/experience/places/WorkspaceBusinessDetails";
import { saveBusinessDetailsAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business details", robots: { index: false, follow: false }, referrer: "no-referrer" };

const OUTCOMES = new Set<DetailsSaveOutcome>(["saved", "unchanged", "conflict", "invalid", "denied", "failed"]);

/** The business-menu home of /dashboard/settings (owner-entry spec §5). */
export default async function BusinessDetailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { workspaceId, actor } = await openWorkspacePlace(params, "/workspace/business-details");
  const state = await readPlace("business-details", workspaceId, async () => {
    // The record read refuses non-members; the sites read adds the tenant check.
    const [record, linked, operator] = await Promise.all([
      readBusinessRecord(actor, workspaceId),
      readLinkedSites(actor, workspaceId),
      isSuperAdmin().catch(() => false),
    ]);
    const googleApprovalCopy = recordGoogleApprovalCopy(record, await recordGoogleApprovalPolicyEnabled(workspaceId, actor));
    return { record, operator, googleApprovalCopy, publishing: await publishingEnabledForWorkspace(workspaceId, actor), sites: linked.sites, denied: linked.denied };
  });
  const result = typeof params.result === "string" && OUTCOMES.has(params.result as DetailsSaveOutcome) ? params.result as DetailsSaveOutcome : null;
  const field = typeof params.field === "string" && (EDITABLE_DETAILS as readonly string[]).includes(params.field) ? params.field as EditableDetail : null;
  const googleResult = typeof params.googleResult === "string" && ["needs_approval", "confirmed", "unconfirmed", "failed", "unavailable"].includes(params.googleResult) ? params.googleResult as import("@/products/publishing/server").RecordGoogleSummary : null;
  return <WorkspaceBusinessDetails workspaceId={workspaceId} state={state} result={result} googleResult={googleResult} field={field} action={saveBusinessDetailsAction} />;
}
