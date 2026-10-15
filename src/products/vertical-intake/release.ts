import type { ReleaseEnvironment } from "@/platform/release-flags/resolve";
import { builtInAppReleaseMayReach, readBuiltInAppRelease } from "@/platform/app-releases/server";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { customerEmailEnabled } from "@/platform/infra/email/enabled";

/** Cheap early gate: could Dental intake be on for any business? Env only. */
export function verticalIntakeReleaseMayBeOn(env: ReleaseEnvironment = process.env): boolean {
  return builtInAppReleaseMayReach("dental_intake", "dental_intake.baseline", env) && env.STRELVA_WORKSPACE_RELEASE === "1";
}

/** Per business, for a signed-in person. */
export async function verticalIntakeReleasedFor(actor: { userId: string }, workspaceId: string): Promise<boolean> {
  if (!verticalIntakeReleaseMayBeOn()) return false;
  const state = await readBuiltInAppRelease("dental_intake", workspaceId, await releaseViewerFor(actor));
  return state.available;
}

/** The public form and its submissions: the same operator-only rule as the connected-site door. */
export async function verticalIntakePublicFor(workspaceId: string): Promise<boolean> {
  if (!verticalIntakeReleaseMayBeOn()) return false;
  return workspaceReleaseFlagEnabled("vertical_intake", workspaceId, { operator: true, tester: false });
}

/** The member ID field needs the env switch and an encryption key. The install must also turn it on. */
export function intakeSensitiveFieldsAvailable(env: ReleaseEnvironment = process.env): boolean {
  return env.STRELVA_INTAKE_SENSITIVE_FIELDS?.trim() === "1" && Boolean(env.SECRETS_ENC_KEY);
}

/** Patients are emailed only when customer email is on. The copy says so when it is off. */
export function intakeEmailOn(): boolean {
  return customerEmailEnabled();
}
