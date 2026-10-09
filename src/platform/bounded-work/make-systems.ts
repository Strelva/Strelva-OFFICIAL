import { WorkspaceAccessError, WorkspaceMakeSystemsError, type SavedWork, type SaveWorkInput, type WorkspaceActor } from "@/platform/workspaces/types";
import type { BoundedStore } from "./repository";

/**
 * Making an internal tool (create, from-source copy, plan output) needs
 * make_systems: the business's acting provider or a delegated agency
 * (docs/product/specs/systems-catalog.md section 4). Owners, admins and
 * members get WorkspaceMakeSystemsError, which the HTTP layer turns into
 * MAKE_SYSTEMS_REQUIRED_MESSAGE with a Request action.
 *
 * Focused in-memory test stores have no authority surface; they keep their
 * membership check so existing lifecycle tests stay meaningful.
 */
export async function requireSystemMaker(store: BoundedStore, actor: WorkspaceActor, workspaceId: string): Promise<void> {
  if (!store.makeSystems) {
    await store.member(actor, workspaceId);
    return;
  }
  const authority = await store.makeSystems(actor, workspaceId);
  if (authority === "provider" || authority === "agency") return;
  if (authority === "member") throw new WorkspaceMakeSystemsError();
  throw new WorkspaceAccessError();
}

/**
 * Changing an internal tool's design (revise, rehearse,
 * retire, adopt an update). A direct member without make_systems is refused
 * here. An actor with no direct membership falls through to the existing
 * checks, so a per-application agency draft grant still decides in SQL.
 * Publication and release rollback are separate owner/admin approvals of an
 * already maker-authored candidate or release; neither grants design access.
 */
export async function requireSystemChanger(store: BoundedStore, actor: WorkspaceActor, workspaceId: string): Promise<void> {
  if (!store.makeSystems) return;
  const authority = await store.makeSystems(actor, workspaceId);
  if (authority === "member") throw new WorkspaceMakeSystemsError();
}

/** Create through the maker path when the store has one. */
export function createSystemWork(store: BoundedStore, actor: WorkspaceActor, workspaceId: string, input: SaveWorkInput): Promise<SavedWork> {
  return store.createSystem ? store.createSystem(actor, workspaceId, input) : store.create(actor, workspaceId, input);
}
