import type { ReleaseViewer } from "./resolve";

/**
 * The release viewer for a signed-in actor: an active super admin counts as
 * an operator, and the store adds the workspace's named testers by user id.
 * A failed super-admin read counts as "not an operator" (never widens).
 */
export async function releaseViewerFor(actor: { userId: string } | null | undefined): Promise<ReleaseViewer> {
  if (!actor) return { operator: false, tester: false };
  let operator = false;
  try {
    const { isSuperAdminUser } = await import("@/lib/db/repositories");
    operator = await isSuperAdminUser(actor.userId);
  } catch {
    operator = false;
  }
  return { operator, tester: false, userId: actor.userId };
}

/** The viewer for the request's signed-in user (tenant routes that have no workspace actor). */
export async function currentReleaseViewer(): Promise<ReleaseViewer> {
  try {
    const { getAuthUserId } = await import("@/lib/auth");
    const userId = await getAuthUserId();
    return releaseViewerFor(userId ? { userId } : null);
  } catch {
    return { operator: false, tester: false };
  }
}

/** Operator-facing work (crons that alert operators): an `operators` row counts. */
export const OPERATOR_VIEWER: ReleaseViewer = { operator: true, tester: false };
