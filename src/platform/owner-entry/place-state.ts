import { WorkspaceAccessError } from "@/platform/workspaces/types";

/** What a workspace place renders: its data, a refusal, or a failure. */
export type PlaceState<T> =
  | { kind: "ready"; data: T }
  | { kind: "permission" }
  | { kind: "error" };

/** A refused membership is `permission`; anything else that throws is `error`, logged. */
export async function readPlace<T>(label: string, workspaceId: string, read: () => Promise<T>): Promise<PlaceState<T>> {
  try {
    return { kind: "ready", data: await read() };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return { kind: "permission" };
    console.error(`[${label}] page read failed`, { workspaceId, error: error instanceof Error ? error.message : String(error) });
    return { kind: "error" };
  }
}
