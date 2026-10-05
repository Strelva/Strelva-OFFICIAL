import type { WorkspaceActor } from "@/platform/workspaces/types";
import type {
  ConnectInput,
  ConnectionState,
  CreateSystemInput,
  IssueOutputInput,
  RecordRevisionInput,
  System,
  SystemConnection,
  SystemDetail,
  SystemGraph,
  SystemLifecycle,
  SystemOutput,
  SystemRef,
  SystemRevision,
  UpdateSystemInput,
} from "./contracts";

/**
 * The System repository. `businessId` is the customer workspace id. Every
 * call is made on behalf of an actor and rechecks that actor's access to the
 * business at call time: any member reads; owner, admin or an accepted agency
 * delivery writes (the business record's access rule). Writes stop after a
 * workspace exit.
 *
 * Create, revision, output and connect calls carry a command id. Repeating a
 * call with the same id and the same body returns the first result; the same
 * id with a different body is a `system_command_conflict`.
 */
export interface SystemStore {
  readGraph(actor: WorkspaceActor, businessId: string): Promise<SystemGraph>;
  readSystem(actor: WorkspaceActor, ref: SystemRef): Promise<SystemDetail>;
  createSystem(actor: WorkspaceActor, businessId: string, input: CreateSystemInput, commandId: string): Promise<System>;
  updateSystem(actor: WorkspaceActor, ref: SystemRef, expectedChange: number, patch: UpdateSystemInput): Promise<System>;
  /**
   * Records an immutable revision. By default it becomes current, guarded by
   * the change number. With `{ activate: false }` it is staged: it exists,
   * the pointer does not move, and `expectedChange` may be null.
   */
  recordRevision(
    actor: WorkspaceActor, ref: SystemRef, expectedChange: number | null, input: RecordRevisionInput, commandId: string,
    options?: { activate?: boolean },
  ): Promise<{ system: System; revision: SystemRevision }>;
  /**
   * Compare-and-set on the current revision pointer: activate a staged
   * revision or restore an earlier one. Fails with `system_baseline_moved`
   * unless the pointer is at `expectedCurrentRevisionId`. Already current is a
   * no-op. Issued outputs keep the revision they pinned.
   */
  setCurrentRevision(
    actor: WorkspaceActor, ref: SystemRef, revisionId: string, expectedCurrentRevisionId: string | null,
  ): Promise<System>;
  transitionLifecycle(actor: WorkspaceActor, ref: SystemRef, expectedChange: number, to: SystemLifecycle): Promise<System>;
  issueOutput(actor: WorkspaceActor, ref: SystemRef, input: IssueOutputInput, commandId: string): Promise<SystemOutput>;
  acceptOutput(actor: WorkspaceActor, ref: SystemRef, outputId: string): Promise<SystemOutput>;
  connect(actor: WorkspaceActor, input: ConnectInput, commandId: string): Promise<SystemConnection>;
  setConnectionState(actor: WorkspaceActor, businessId: string, connectionId: string, state: ConnectionState): Promise<SystemConnection>;
}
