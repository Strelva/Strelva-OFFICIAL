"use server";

import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { patchBusinessRecord, readBusinessRecord } from "@/platform/business-record/service";
import { saveBusinessDetails } from "@/platform/business-record/details-save";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** The Business details form. The person comes from the session, never the form. */
export async function saveBusinessDetailsAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const revision = Number(formData.get("revision"));
  if (!workspaceReleaseEnabled() || !UUID.test(workspaceId) || !Number.isSafeInteger(revision) || revision < 0) redirect("/workspace");
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/business-details?workspaceId=${workspaceId}`)}`);
  if (!(await ownerEntryHomesOpen(workspaceId, user.id))) redirect(`/workspace?workspaceId=${workspaceId}`);
  const { outcome, field } = await saveBusinessDetails(
    { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId, revision, formData,
    { read: readBusinessRecord, patch: patchBusinessRecord, operator: isSuperAdmin },
  );
  const params = new URLSearchParams({ workspaceId, result: outcome, ...(field ? { field } : {}) });
  redirect(`/workspace/business-details?${params}`);
}
