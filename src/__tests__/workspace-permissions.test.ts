import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLE_PERMISSIONS,
  rolesAllowing,
  workspaceRoleAllows,
  type WorkspacePermission,
} from "@/platform/workspaces/permissions";
import type { WorkspaceRole } from "@/platform/workspaces/types";

const ROLES: WorkspaceRole[] = ["owner", "admin", "member"];

/** Rows between the authority-fixture markers in the SQL parity test. The SQL
 * check proves public.workspace_role_allows() equals these rows; this test
 * proves the TypeScript table equals them too. */
function sqlFixture(): Array<{ role: string; permission: string; allowed: boolean }> {
  const sql = readFileSync(path.join(process.cwd(), "tests/workspace-authority-schema.sql"), "utf8");
  const block = sql.split("-- authority-fixture:start")[1]?.split("-- authority-fixture:end")[0] ?? "";
  return [...block.matchAll(/\('(\w+)','(\w+)',(true|false)\)/g)].map((match) => ({
    role: match[1]!,
    permission: match[2]!,
    allowed: match[3] === "true",
  }));
}

describe("workspace role x permission table", () => {
  it("matches the SQL parity fixture row for row", () => {
    const fixture = sqlFixture();
    expect(fixture).toHaveLength(ROLES.length * WORKSPACE_PERMISSIONS.length);
    const fromTs = ROLES.flatMap((role) => WORKSPACE_PERMISSIONS.map((permission) => ({
      role, permission, allowed: workspaceRoleAllows(role, permission),
    })));
    const key = (row: { role: string; permission: string }) => `${row.role}:${row.permission}`;
    expect([...fixture].sort((a, b) => key(a).localeCompare(key(b))))
      .toEqual([...fromTs].sort((a, b) => key(a).localeCompare(key(b))));
  });

  it("names every permission the SQL helper accepts and no others", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261007192000_make_systems_authority.sql"),
      "utf8",
    );
    const body = migration.split("create or replace function public.workspace_role_allows")[1]!.split("$$;")[0]!;
    const named = [...body.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!)
      .filter((value) => !["owner", "admin", "member", "workspace_permission_unknown"].includes(value));
    expect(new Set(named)).toEqual(new Set(WORKSPACE_PERMISSIONS));
  });

  it("keeps three tiers: member, owner/admin, owner only", () => {
    expect(WORKSPACE_ROLE_PERMISSIONS).toMatchInlineSnapshot(`
      {
        "admin": [
          "create_work",
          "create_handoff",
          "record_calendar_receipt",
          "manage_calendar",
          "manage_delegations",
          "manage_handoffs",
          "manage_work_authority",
          "manage_ongoing",
          "manage_offerings",
        ],
        "member": [
          "create_work",
          "create_handoff",
          "record_calendar_receipt",
        ],
        "owner": [
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
        ],
      }
    `);
    expect(rolesAllowing("create_handoff")).toEqual(["owner", "admin", "member"]);
    expect(rolesAllowing("manage_calendar")).toEqual(["owner", "admin"]);
    expect(rolesAllowing("manage_members")).toEqual(["owner"]);
  });

  it("gives no permission to a missing role, a legacy tenant role, or Strelva staff", () => {
    for (const permission of WORKSPACE_PERMISSIONS) {
      expect(workspaceRoleAllows(null, permission)).toBe(false);
      expect(workspaceRoleAllows(undefined, permission)).toBe(false);
      for (const role of ["viewer", "editor", "super_admin", "toString", "__proto__"]) {
        expect(workspaceRoleAllows(role as WorkspaceRole, permission as WorkspacePermission)).toBe(false);
      }
    }
  });
});
