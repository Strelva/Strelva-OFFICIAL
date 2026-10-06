"use server";

/**
 * Server actions behind the human-minute log. Each re-verifies super-admin
 * independently (the /admin layout gate does NOT protect a server action's POST
 * surface) and passes the verified session identity to the SQL boundary, which
 * rechecks the active super_admins row before writing.
 */
import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/platform/infra/auth";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import {
  BusinessEffortAccessError, BusinessEffortConflictError, BusinessEffortNotFoundError,
  BusinessEffortValidationError, PostgresBusinessEffortStore, recordBusinessEffort, voidBusinessEffort,
  type RecordBusinessEffortInput, type VoidBusinessEffortInput,
} from "@/platform/business-effort";

export type EffortActionResult = { ok: boolean; message: string };

function failure(error: unknown): EffortActionResult {
  if (
    error instanceof BusinessEffortValidationError ||
    error instanceof BusinessEffortAccessError ||
    error instanceof BusinessEffortNotFoundError ||
    error instanceof BusinessEffortConflictError
  ) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: "Human-minute storage is unavailable. Nothing was saved; try again." };
}

async function operatorActor() {
  if (!(await isSuperAdmin())) return null;
  return workspaceHttpActor();
}

function refresh() {
  revalidatePath("/admin/work");
  revalidatePath("/admin/clients/[id]", "page");
}

export async function recordBusinessEffortAction(input: RecordBusinessEffortInput): Promise<EffortActionResult> {
  if (!workspaceReleaseEnabled()) return { ok: false, message: "Human minutes are unavailable while the workspace release is off." };
  try {
    const entry = await recordBusinessEffort(PostgresBusinessEffortStore, await operatorActor(), input);
    refresh();
    return { ok: true, message: `Recorded ${entry.minutes} minutes.` };
  } catch (error) {
    return failure(error);
  }
}

export async function voidBusinessEffortAction(input: VoidBusinessEffortInput): Promise<EffortActionResult> {
  if (!workspaceReleaseEnabled()) return { ok: false, message: "Human minutes are unavailable while the workspace release is off." };
  try {
    await voidBusinessEffort(PostgresBusinessEffortStore, await operatorActor(), input);
    refresh();
    return { ok: true, message: "Entry voided. It stays in the history and no longer counts." };
  } catch (error) {
    return failure(error);
  }
}
