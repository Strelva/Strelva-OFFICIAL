import type { WorkspaceRole } from "./types";

/**
 * One named thing a workspace role allows across a whole workspace. A
 * permission lasts as long as the membership; it never stands in for an
 * Assignment on specific work, and delegated read satisfies none of them.
 *
 * Mirrored in SQL by `public.workspace_role_allows` (migration
 * 20261005120000_workspace_authority_helpers.sql). The parity test in
 * src/__tests__/workspace-permissions.test.ts fails if the two drift.
 */
export const WORKSPACE_PERMISSIONS = [
  "create_work",
  "create_handoff",
  "record_calendar_receipt",
  "manage_calendar",
  "manage_delegations",
  "manage_handoffs",
  "manage_work_authority",
  "manage_ongoing",
  "manage_offerings",
  "invite_members",
  "sponsor_assignment",
  "exit_workspace",
  "manage_members",
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

const MEMBER: readonly WorkspacePermission[] = ["create_work", "create_handoff", "record_calendar_receipt"];
const MANAGER: readonly WorkspacePermission[] = [
  ...MEMBER,
  "manage_calendar",
  "manage_delegations",
  "manage_handoffs",
  "manage_work_authority",
  "manage_ongoing",
  "manage_offerings",
];
const OWNER: readonly WorkspacePermission[] = [
  ...MANAGER,
  "invite_members",
  "sponsor_assignment",
  "exit_workspace",
  "manage_members",
];

/** No Strelva-staff entry exists, by design (docs/architecture/auth-tenancy.md). */
export const WORKSPACE_ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, readonly WorkspacePermission[]>> = {
  owner: OWNER,
  admin: MANAGER,
  member: MEMBER,
};

export function workspaceRoleAllows(role: WorkspaceRole | null | undefined, permission: WorkspacePermission): boolean {
  if (!role || !Object.prototype.hasOwnProperty.call(WORKSPACE_ROLE_PERMISSIONS, role)) return false;
  return WORKSPACE_ROLE_PERMISSIONS[role].includes(permission);
}

export function rolesAllowing(permission: WorkspacePermission): WorkspaceRole[] {
  return (Object.keys(WORKSPACE_ROLE_PERMISSIONS) as WorkspaceRole[]).filter((role) => workspaceRoleAllows(role, permission));
}

/** Errors raised by `public.workspace_require` inside the write RPCs. */
export function isWorkspaceAuthorityFailure(detail: string): boolean {
  return detail.includes("workspace_membership_required") || detail.includes("workspace_permission_denied");
}
