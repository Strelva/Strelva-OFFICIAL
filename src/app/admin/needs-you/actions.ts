"use server";

/**
 * Strelva's layer of a business's decision policy. The action re-verifies
 * super admin itself (the /admin layout gate does not protect a server
 * action's POST) and the SQL checks the active super_admins row again. It
 * never writes the owner's layer: an operator never decides for the owner.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSuperAdmin } from "@/platform/infra/auth";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import {
  PolicySettingRefusedError,
  PostgresPolicySettingsStore,
  applyPolicyChange,
  buildPolicyView,
  planStrelvaChange,
  strelvaChangeSchema,
  type PolicyView,
} from "@/platform/needs-you/policy";

export type PolicyActionResult = { ok: true; message: string; view: PolicyView } | { ok: false; message: string };

const input = z.object({ workspaceId: z.string().uuid(), change: strelvaChangeSchema }).strict();

export async function setStrelvaPolicyAction(raw: unknown): Promise<PolicyActionResult> {
  if (!needsYouReleaseEnabled()) return { ok: false, message: "Needs you is off. Nothing changed." };
  if (!(await isSuperAdmin())) return { ok: false, message: "Only a Strelva operator can change this." };
  const actor = await workspaceHttpActor();
  if (!actor) return { ok: false, message: "Only a Strelva operator can change this." };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Check the setting and try again. Nothing changed." };
  try {
    const rows = await applyPolicyChange(PostgresPolicySettingsStore, actor, parsed.data.workspaceId, current => planStrelvaChange(current, parsed.data.change));
    revalidatePath("/admin/needs-you");
    return { ok: true, message: "Saved. The change is in the policy history.", view: buildPolicyView(rows) };
  } catch (error) {
    if (error instanceof PolicySettingRefusedError || error instanceof WorkspaceConflictError) return { ok: false, message: error.message };
    if (error instanceof WorkspaceAccessError) return { ok: false, message: "Only a Strelva operator can change this." };
    return { ok: false, message: "Policy storage is unavailable. Nothing was saved; try again." };
  }
}
