import type { WorkAllowanceInspection } from "@/platform/work-economics/allowances";
import type { WorkspaceSnapshot, WorkspaceSummary, WorkspaceWork } from "./contracts";
import { normalizeWorkspaceSnapshot } from "./result";
import { workspaceHome } from "./workspace-home";

export const MAX_AGENCY_CLIENT_LOADS = 8;

export interface AgencyClientTarget {
  id: string;
  name: string;
  workIds: string[];
}

export interface AgencyClientSnapshot {
  workspace: WorkspaceSummary;
  work: WorkspaceWork[];
}

export interface AgencyClientLoadResult {
  clients: AgencyClientSnapshot[];
  failed: AgencyClientTarget[];
  omittedCount: number;
  totalCount: number;
}

export interface AgencyCreditPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  units: Array<{ unitKind: string; creditedUnits: number }>;
}

export interface AgencyQueueItem {
  client: AgencyClientSnapshot;
  work: WorkspaceWork;
  reason: string;
}

/**
 * A relationship label is not access. Only active work delegations naming the
 * selected agency can create client targets, and the customer must still be a
 * delegated-read workspace in the server-authored snapshot.
 */
export function agencyClientTargets(
  snapshot: WorkspaceSnapshot,
  limit = MAX_AGENCY_CLIENT_LOADS,
  offset = 0,
): { targets: AgencyClientTarget[]; totalCount: number; omittedCount: number } {
  const current = snapshot.workspaces.find((workspace) => workspace.id === snapshot.workspaceId);
  if (current?.kind !== "agency" || current.access === "delegated_read") {
    return { targets: [], totalCount: 0, omittedCount: 0 };
  }

  const delegatedWork = new Map<string, string[]>();
  for (const delegation of snapshot.delegations) {
    if (delegation.status !== "active" || delegation.agencyWorkspaceId !== snapshot.workspaceId || !delegation.customerWorkspaceId) continue;
    const workIds = delegatedWork.get(delegation.customerWorkspaceId) ?? [];
    if (!workIds.includes(delegation.workId)) workIds.push(delegation.workId);
    delegatedWork.set(delegation.customerWorkspaceId, workIds);
  }
  const all = snapshot.workspaces.flatMap((workspace): AgencyClientTarget[] => (
    workspace.kind === "customer"
      && delegatedWork.has(workspace.id)
      ? [{ id: workspace.id, name: workspace.name, workIds: delegatedWork.get(workspace.id)! }]
      : []
  ));
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : MAX_AGENCY_CLIENT_LOADS;
  const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const targets = all.slice(start, start + boundedLimit);
  return {
    targets,
    totalCount: all.length,
    omittedCount: all.length - targets.length,
  };
}

function isAuthorizedClientSnapshot(value: unknown, target: AgencyClientTarget): value is WorkspaceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<WorkspaceSnapshot>;
  if (snapshot.workspaceId !== target.id || !Array.isArray(snapshot.workspaces) || !Array.isArray(snapshot.work)) return false;
  const selected = snapshot.workspaces.find((workspace) => workspace?.id === target.id);
  if (selected?.kind !== "customer") return false;
  return snapshot.work.every((work) => work?.workspaceId === target.id);
}

function responseError(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Client work could not be loaded.";
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : "Client work could not be loaded.";
}

/** Each request rechecks the actor's current delegated access at the workspace route. */
export async function loadAgencyClientSnapshots(
  request: typeof fetch,
  snapshot: WorkspaceSnapshot,
  signal?: AbortSignal,
  offset = 0,
): Promise<AgencyClientLoadResult> {
  const selection = agencyClientTargets(snapshot, MAX_AGENCY_CLIENT_LOADS, offset);
  const loaded = await Promise.all(selection.targets.map(async (target) => {
    try {
      const response = await request(`/api/workspace?workspaceId=${encodeURIComponent(target.id)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(value));
      if (!isAuthorizedClientSnapshot(value, target)) throw new Error("Client work returned outside its authorized workspace.");
      const delegatedWorkIds = new Set(target.workIds);
      const normalized = normalizeWorkspaceSnapshot({ ...value, work: value.work.filter((work) => delegatedWorkIds.has(work.id)) });
      const workspace = normalized.workspaces.find((item) => item.id === target.id)!;
      return { ok: true as const, client: { workspace, work: normalized.work } };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ok: false as const, target };
    }
  }));

  return {
    clients: loaded.flatMap((result) => result.ok ? [result.client] : []),
    failed: loaded.flatMap((result) => result.ok ? [] : [result.target]),
    omittedCount: selection.omittedCount,
    totalCount: selection.totalCount,
  };
}

export function agencyAttentionQueue(clients: readonly AgencyClientSnapshot[]): AgencyQueueItem[] {
  return clients.flatMap((client) => workspaceHome(client.work).attention.map(({ work, reason }) => ({ client, work, reason })))
    .sort((left, right) => Date.parse(right.work.createdAt) - Date.parse(left.work.createdAt));
}

/** Credits appear only when the allowance response contains an explicit award. */
export function agencyCreditPeriods(inspection: WorkAllowanceInspection): AgencyCreditPeriod[] {
  return inspection.allowances.flatMap((allowance): AgencyCreditPeriod[] => {
    const units = allowance.buckets.flatMap((bucket) => bucket.creditedUnits > 0
      ? [{ unitKind: bucket.unitKind, creditedUnits: bucket.creditedUnits }]
      : []);
    return units.length ? [{
      id: allowance.id,
      periodStart: allowance.periodStart,
      periodEnd: allowance.periodEnd,
      units,
    }] : [];
  });
}
