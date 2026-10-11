import { getDashboardSurfaces, tenantHasStore, type SurfaceTenantConfig } from "@/lib/dashboard-surfaces";
import type { Connection } from "@/lib/types";
import { readTenantWorkspaceLink } from "@/platform/business-record/service";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import {
  RELEASE_FLAG_ENV,
  RELEASE_FLAG_LABELS,
  RELEASE_FLAGS,
  effectiveReleaseState,
  isMakeRealLiveFlag,
  releaseFlagEnvMode,
  workspaceReleaseOn,
  type ReleaseEnvironment,
  type ReleaseFlag,
  type ReleaseFlagEnvMode,
  type ReleaseFlagRowState,
} from "@/platform/release-flags/resolve";
import {
  ReleaseFlagValidationError,
  readWorkspaceReleaseFlagHistory,
  readWorkspaceReleaseFlags,
  setWorkspaceReleaseFlag,
  setWorkspaceReleaseTester,
  type ReleaseFlagChange,
} from "@/platform/release-flags/store";
import { pagesBlockingOwnerEntry, type DashboardPageUse } from "./dispositions";
import type { OperatorAuditContext } from "@/platform/workspaces/operator-approvals";

/**
 * Operator controls for one client's release flags (`/admin/clients/[id]`).
 * Every change names its reason and is recorded in the flag history; the
 * first `on` for a client records a one-use server approval for the
 * authenticated operator, bound to the exact flag, state and reason.
 */

export interface TenantPageFacts {
  tenantConfig: SurfaceTenantConfig;
  connections: Connection[];
  hasCommerce: boolean;
}

/** Which `/dashboard` page groups this tenant uses, from the same surfaces its nav shows. */
export function dashboardUsesForTenant(facts: TenantPageFacts): Set<DashboardPageUse> {
  const uses = new Set<DashboardPageUse>(["always"]);
  const surfaces = getDashboardSurfaces({ tenantConfig: facts.tenantConfig, connections: facts.connections });
  if (surfaces.some((surface) => (surface.id === "google-business" || surface.id === "reviews") && surface.state !== "hidden")) uses.add("local");
  if (surfaces.some((surface) => surface.id === "schedule" || surface.id === "members" || surface.id === "roster")) uses.add("wellness");
  if (tenantHasStore({ tenantConfig: facts.tenantConfig, hasCommerce: facts.hasCommerce })) uses.add("store");
  return uses;
}

export interface ReleaseFlagView {
  flag: ReleaseFlag;
  label: string;
  envName: string;
  envMode: ReleaseFlagEnvMode;
  row: ReleaseFlagRowState | null;
  revision: number;
  effective: "off" | "operators" | "on";
}

export type TenantReleaseState =
  | { linked: false; tenantId: string }
  | {
    linked: true;
    tenantId: string;
    workspaceId: string;
    workspaceRelease: boolean;
    flags: ReleaseFlagView[];
    testerEmails: string[];
    history: ReleaseFlagChange[];
    ownerEntryBlockers: Array<{ route: string; home: string; note: string }>;
  };

export async function readTenantReleaseState(operatorEmail: string, tenantId: string, facts: TenantPageFacts, environment: ReleaseEnvironment = process.env): Promise<TenantReleaseState> {
  const link = await readTenantWorkspaceLink(operatorEmail, tenantId);
  if (!link.link) return { linked: false, tenantId };
  const workspaceId = link.link.workspaceId;
  const [stored, history] = await Promise.all([
    readWorkspaceReleaseFlags(workspaceId, { fresh: true }),
    readWorkspaceReleaseFlagHistory(operatorEmail, workspaceId, 20),
  ]);
  const workspaceRelease = workspaceReleaseOn(environment);
  return {
    linked: true,
    tenantId,
    workspaceId,
    workspaceRelease,
    flags: RELEASE_FLAGS.map((flag) => {
      const row = stored.flags[flag] ?? null;
      const envMode = releaseFlagEnvMode(flag, environment);
      return {
        flag, label: RELEASE_FLAG_LABELS[flag], envName: RELEASE_FLAG_ENV[flag], envMode,
        row: row?.state ?? null, revision: row?.revision ?? 0,
        effective: effectiveReleaseState({ workspaceRelease, env: envMode, row: row?.state ?? null }),
      };
    }),
    testerEmails: stored.testerEmails,
    history,
    ownerEntryBlockers: pagesBlockingOwnerEntry(dashboardUsesForTenant(facts)).map((entry) => ({ route: entry.route, home: entry.home, note: entry.note ?? "" })),
  };
}

export type ReleaseFlagCommand =
  | { kind: "flag"; flag: ReleaseFlag; state: ReleaseFlagRowState | "unset"; reason: string; expectedRevision: number }
  | { kind: "tester"; email: string; present: boolean; reason: string };

export async function applyTenantReleaseCommand(actor: WorkspaceActor, tenantId: string, facts: TenantPageFacts, command: ReleaseFlagCommand, auditContext: OperatorAuditContext = { source: "web" }): Promise<void> {
  const operatorEmail = actor.verifiedEmail;
  const link = await readTenantWorkspaceLink(operatorEmail, tenantId);
  if (!link.link) throw new ReleaseFlagValidationError("workspace_release_unlinked", "This client isn't converted to a business workspace yet.");
  const workspaceId = link.link.workspaceId;
  if (command.kind === "tester") {
    await setWorkspaceReleaseTester({ operatorEmail, workspaceId, testerEmail: command.email, present: command.present, reason: command.reason });
    return;
  }
  const reason = command.reason.trim();
  if (isMakeRealLiveFlag(command.flag) && (command.state === "on" || command.state === "operators")) {
    // A live channel only ever runs where Systems itself is shown (spec 6.3).
    const stored = await readWorkspaceReleaseFlags(workspaceId, { fresh: true });
    const systems = stored.flags.systems?.state ?? null;
    if (systems !== "on" && systems !== "operators") {
      throw new ReleaseFlagValidationError("workspace_release_systems_first", "Turn Systems on for this client (operators or on) before a live Make real channel.");
    }
  }
  if (command.state === "on") {
    if (command.flag === "owner_entry") {
      const blockers = pagesBlockingOwnerEntry(dashboardUsesForTenant(facts));
      if (blockers.length > 0) {
        throw new ReleaseFlagValidationError("workspace_release_pages_not_ready",
          `Owner entry can go on only when every page this client uses has moved. Still on /dashboard: ${blockers.map((entry) => `/dashboard${entry.route === "/" ? "" : entry.route}`).join(", ")}. Use operators until then.`);
      }
    }
  }
  await setWorkspaceReleaseFlag({ actor, workspaceId, flag: command.flag, state: command.state, reason, expectedRevision: command.expectedRevision, auditContext });
}
