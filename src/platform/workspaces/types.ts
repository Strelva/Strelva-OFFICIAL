export type WorkspaceKind = "personal" | "agency" | "customer";
export type WorkspaceRole = "owner" | "admin" | "member";

export interface WorkspaceActor {
  userId: string;
  verifiedEmail: string;
}

export interface Workspace {
  id: string;
  kind: WorkspaceKind;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  role?: WorkspaceRole;
  access: "member" | "delegated_read";
}

export interface SavedWork {
  id: string;
  workspaceId: string;
  productId: string;
  resourceKind: string;
  title?: string;
  payload: unknown;
  input?: unknown;
  sourceWorkId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveWorkInput {
  productId: string;
  resourceKind: string;
  title?: string;
  payload: unknown;
  input?: unknown;
  sourceWorkId?: string;
}

export interface Handoff {
  id: string;
  agencyWorkspaceId: string;
  sourceWorkId: string;
  recipientEmail: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  acceptedBy?: string;
  acceptedAt?: string;
  customerWorkspaceId?: string;
  customerWorkId?: string;
  delegationId?: string;
}

/** The recipient must choose an existing business or name a new one. */
export type HandoffDestination =
  | { kind: "existing"; workspaceId: string }
  | { kind: "new"; name: string };

/** A current customer workspace the addressed recipient may choose. */
export interface HandoffDestinationOption {
  id: string;
  name: string;
}

export interface HandoffPreview {
  id: string;
  agencyWorkspace: Pick<Workspace, "id" | "name" | "kind">;
  /** Full proposed artifact, disclosed only after token + verified-recipient checks. */
  work: SavedWork;
  recipientEmail: string;
  status: Handoff["status"];
  expiresAt: string;
  destinations: HandoffDestinationOption[];
}

export interface Delegation {
  id: string;
  customerWorkspaceId: string;
  customerWorkId: string;
  agencyWorkspaceId: string;
  scope: readonly ["work:read"];
  status: "active" | "revoked";
  createdAt: string;
  revokedAt?: string;
}

export interface AcceptedHandoff {
  handoffId: string;
  customerWorkspaceId: string;
  customerWorkId: string;
  delegationId?: string;
  alreadyAccepted: boolean;
}

export class WorkspaceAccessError extends Error {
  constructor(message = "Workspace access denied") {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

export class WorkspaceConflictError extends Error {
  constructor(message = "The workspace operation conflicts with its current state") {
    super(message);
    this.name = "WorkspaceConflictError";
  }
}

export class WorkspaceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceStoreError";
  }
}
