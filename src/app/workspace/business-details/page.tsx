import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
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
import { listingsSyncAvailable, listingsSyncMayBeOn } from "@/products/listings-sync/server";
import { verticalIntakeReleaseMayBeOn } from "@/products/vertical-intake/server";
import { saveBusinessDetailsAction, undoBusinessDetailsAction } from "./actions";
import { readersFromSystems } from "@/experience/record/record-readers";
import type { WorkspaceActor } from "@/platform/workspaces/types";

/** Which live Systems read each detail, from the business's own System graph.
 * Any failure reads as unknown, and the page then draws no "Read by" column. */
async function readRecordReaders(actor: WorkspaceActor, workspaceId: string, publishing: boolean) {
  try {
    // Loaded on demand: the System graph readers are heavy and only this read needs them.
    const [{ listBusinessSystems }, { createSupabaseSystemStore }, { withPublishing }] = await Promise.all([
      import("@/platform/systems/from-existing"), import("@/platform/systems/supabase-store"), import("@/experience/systems/server"),
    ]);
    const listing = await listBusinessSystems(actor, workspaceId, { store: createSupabaseSystemStore() });
    const graph = publishing ? (await withPublishing(listing, actor, Date.now())).listing : listing;
    return readersFromSystems(graph);
  } catch { return undefined; }
}

export const dynamic = "force-dynamic";
// Keep private workspace URLs off cross-origin requests while preserving the
// same-origin browser Origin required by progressive-enhancement Server Actions.
export const metadata: Metadata = { title: "Business details", robots: { index: false, follow: false }, referrer: "same-origin" };

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
    // Where your details appear: only where Listings in sync is on for this business. Any failure reads as off.
    const listings = listingsSyncMayBeOn() && await listingsSyncAvailable(workspaceId, { operator, tester: false, userId: actor.userId }).catch(() => false);
    const publishing = await publishingEnabledForWorkspace(workspaceId, actor);
    const readers = await readRecordReaders(actor, workspaceId, publishing);
    return { record, operator, listings, googleApprovalCopy, publishing, readers, sites: linked.sites, denied: linked.denied };
  });
  const result = typeof params.result === "string" && OUTCOMES.has(params.result as DetailsSaveOutcome) ? params.result as DetailsSaveOutcome : null;
  const field = typeof params.field === "string" && (EDITABLE_DETAILS as readonly string[]).includes(params.field) ? params.field as EditableDetail : null;
  const undoneParam = typeof params.undo === "string" && ["done", "failed", "conflict"].includes(params.undo) ? params.undo as "done" | "failed" | "conflict" : null;
  const seqParam = typeof params.seq === "string" && /^[1-9][0-9]{0,15}$/.test(params.seq) ? Number(params.seq) : null;
  const googleResult = typeof params.googleResult === "string" && ["needs_approval", "confirmed", "unconfirmed", "failed", "unavailable"].includes(params.googleResult) ? params.googleResult as import("@/products/publishing/server").RecordGoogleSummary : null;
  return <StrelvaShell workspaceId={workspaceId} active="settings" title={params.edit === "hours" ? "Hours" : "Business record"} systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}><WorkspaceBusinessDetails workspaceId={workspaceId} state={state} readers={state.kind === "ready" ? state.data.readers : undefined} listingsSync={state.kind === "ready" && state.data.listings === true} result={result} googleResult={googleResult} field={field} action={saveBusinessDetailsAction} undoAction={undoBusinessDetailsAction} undo={undoneParam} savedSequence={seqParam} showInsurance={verticalIntakeReleaseMayBeOn()} edit={params.edit === "hours" ? "hours" : null} /></StrelvaShell>;
}
