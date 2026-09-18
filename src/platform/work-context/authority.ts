import type { WorkspaceActor } from "@/platform/workspaces/types";

/** Storage boundary: all reads and commits must re-check current identity and work access. */
export interface WorkAuthority {
  read(actor: WorkspaceActor, workId: string, domain: "context" | "participation"): Promise<WorkAuthoritySnapshot>;
  commit(actor: WorkspaceActor, workId: string, domain: "context" | "participation", expectedRevision: number, payload: unknown, intent: "manage" | "contribute", expectedWorkRevision: string): Promise<void>;
  grantedSource(actor: WorkspaceActor, workId: string, sourceWorkId: string, operation: "read" | "use_in_work"): Promise<WorkSource>;
  source(actor: WorkspaceActor, sourceWorkId: string): Promise<WorkSource>;
}
export interface WorkSource {
  id: string;
  workspaceId: string;
  title: string;
  revision: string;
  payload: unknown;
}
export interface WorkAuthoritySnapshot {
  work: WorkSource;
  role: "owner" | "admin" | "member" | null;
  payload: unknown | null;
}
