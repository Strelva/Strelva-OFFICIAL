"use server";

import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { readBusinessRecord, undoBusinessRecordRevision } from "@/platform/business-record/service";
import { BusinessRecordConflictError } from "@/platform/business-record/repository";
import { detailsWriteSource } from "@/platform/business-record/details";
import { changeRecordWithGoogle } from "@/products/publishing/server";
import { recordGoogleSummary, type RecordGoogleSummary } from "@/products/publishing/server";
import { saveBusinessDetails } from "@/platform/business-record/details-save";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { nativeWebsiteFactsPatch } from "./native-website-facts";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** The Business details form. The person comes from the session, never the form. */
export async function saveBusinessDetailsAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const revision = Number(formData.get("revision"));
  if (!workspaceReleaseEnabled() || !UUID.test(workspaceId) || !Number.isSafeInteger(revision) || revision < 0) redirect("/workspace");
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/business-details?workspaceId=${workspaceId}`)}`);
  if (!(await ownerEntryHomesOpen(workspaceId, user.id))) redirect(`/workspace?workspaceId=${workspaceId}`);
  let googleResult: RecordGoogleSummary | null = null;
  let sequence: number | null = null;
  const { outcome, field } = await saveBusinessDetails(
    { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId, revision, formData,
    // Google record sync (publishing) runs inside the save; the native website
    // fact review (website) then prepares from the accepted record revision.
    { read: readBusinessRecord, patch: nativeWebsiteFactsPatch(async (actor, workspaceId, revision, patch, options) => {
      const result = await changeRecordWithGoogle(actor, workspaceId, revision, patch, { ...options, googleApprovalDisclosed: formData.get("googleApprovalDisclosed") === "1" });
      googleResult = recordGoogleSummary(result); sequence = result.record.sequence; return result.record;
    }), operator: isSuperAdmin },
  );
  const params = new URLSearchParams({ workspaceId, result: outcome });
  if (field) params.set("field", field);
  if (googleResult) params.set("googleResult", googleResult);
  // Undo is offered only for a save that changed nothing outside Strelva.
  if (outcome === "saved" && sequence && !googleResult) params.set("seq", String(sequence));
  redirect(`/workspace/business-details?${params}`);
}

/**
 * Undo the save just made on this page. The record's own undo restores the
 * prior values as a new revision, so who said what stays in History. It is
 * only offered when that save changed nothing on Google.
 */
export async function undoBusinessDetailsAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const sequence = Number(formData.get("sequence"));
  if (!workspaceReleaseEnabled() || !UUID.test(workspaceId) || !Number.isSafeInteger(sequence) || sequence < 1) redirect("/workspace");
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/business-details?workspaceId=${workspaceId}`)}`);
  if (!(await ownerEntryHomesOpen(workspaceId, user.id))) redirect(`/workspace?workspaceId=${workspaceId}`);
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
  let undo: "done" | "failed" | "conflict" = "failed";
  try {
    const record = await readBusinessRecord(actor, workspaceId);
    const source = detailsWriteSource(record.access, await isSuperAdmin().catch(() => false));
    if (source) { await undoBusinessRecordRevision(actor, workspaceId, sequence, { source }); undo = "done"; }
  } catch (error) {
    undo = error instanceof BusinessRecordConflictError ? "conflict" : "failed";
  }
  redirect(`/workspace/business-details?${new URLSearchParams({ workspaceId, undo })}`);
}
