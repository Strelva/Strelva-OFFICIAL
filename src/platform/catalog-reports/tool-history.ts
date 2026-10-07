import { z } from "zod";
import { callReleaseFlagsRpc, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { systemsReleasedFor, systemsReleaseMayBeOn } from "@/platform/systems-release";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { SourceRead } from "@/platform/operator-queue/project";

export async function readToolReleases(actor: WorkspaceActor, workspaceId: string) {
  if (!await systemsReleasedFor(actor, workspaceId)) return [];
  return callReleaseFlagsRpc("read_catalog_tool_releases", {
    p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
  }, z.array(z.object({ workId: z.string().uuid(), version: z.number().int().positive(), at: z.string().datetime({ offset: true }), provenance: z.string() })), "Internal tool history could not be read.");
}

export async function readToolContactConflicts(actor: WorkspaceActor): Promise<SourceRead[]> {
  if (!systemsReleaseMayBeOn()) return [];
  const rows = await callReleaseFlagsRpc("read_catalog_tool_contact_conflicts", {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
  }, z.array(z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), workId: z.string().uuid(), at: z.string() })), "Internal tool contact conflicts could not be read.");
  const enabled = await Promise.all(rows.map(row => workspaceReleaseFlagEnabled("systems", row.workspaceId, { operator: true, tester: false })));
  return [{ kind: "ops_alert", source: "Internal tool contact links", ok: true, rows: rows.filter((_row, index) => enabled[index]).map(row => ({
    kind: "ops_alert", sourceRef: `tool-contact:${row.id}`, workspaceId: row.workspaceId, tenantId: null,
    title: "A submission's email and phone match different contacts; review the merge", openedAt: row.at, facts: { severity: "medium" },
    href: `/workspace?${new URLSearchParams({ workspaceId: row.workspaceId, view: "settings" })}`,
  })) }];
}
