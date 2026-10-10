/**
 * Needs you source: leaving Strelva and exporting (needs-you spec section 6,
 * "Exit, export" → exit; owner only, signed in, owner-started).
 *
 * Nothing waits on the owner here today, so this adapter proposes nothing.
 * Checked on 2026-10-06:
 * - Exit (`src/platform/workspace-exit`) is one synchronous owner command
 *   (`complete_workspace_exit`). Its only stored state is `completed`; there
 *   is no requested-but-undecided exit for anyone to approve.
 * - Export (`src/platform/workspace-exports`) builds the snapshot when the
 *   owner asks and emails the link. There is no pending export decision.
 * - The tenant-model offboarding ask (`offboarding_handoff_request`) is a
 *   tenant event and already reaches Needs you through the tenant event
 *   adapter, routed `exit`.
 *
 * The adapter stays registered so the lifecycle is named and an `exit` item
 * from any future source keyed here can never be resolved by another path.
 * If an exit grows a two-step flow (requested by the owner, confirmed later),
 * propose it here, owner-started only, with `adminMayDecide: false`; the
 * service already refuses email links for `exit`.
 */
import type { SourceAdapter } from "../adapters";

export function workspaceExitAdapter(): SourceAdapter {
  return {
    lifecycle: "workspace_exit",
    needsMemberActor: true,
    async propose() {
      return { items: [], complete: true };
    },
    async currentRevision() {
      // No exit ask stays open, so anything keyed here no longer waits on anyone.
      return null;
    },
    async resolve(_ctx, _item, _decision, by) {
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      // Exit and export are run from the workspace's own exit screen, never from Needs you.
      return { outcome: "failed", reason: "exit_runs_from_its_own_screen" };
    },
  };
}
