import { boundedStore, type BoundedStore } from "@/platform/bounded-work/repository";
import { assertWorkspaceWebsiteAccess } from "@/platform/workspaces/repository";

/** Seat holders may work on websites; this does not broaden the generic member port. */
export const websiteWorkspaceStore: BoundedStore = {
  ...boundedStore,
  member: (actor, workspaceId) => assertWorkspaceWebsiteAccess(actor, workspaceId),
};
