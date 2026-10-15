import { workspaceConnectionSchema, type ConnectionProvider, type ConnectionSource, type ProviderAccess, type ProviderEligibility, type WorkspaceConnection } from "./contracts";
import { UNKNOWN_CONNECTION_HOLDERS, type ConnectionHolders } from "./holders";

export interface WorkspaceConnectionsResult { connections: WorkspaceConnection[]; sourceErrors: ConnectionProvider[] }
export async function composeWorkspaceConnections(input: {
  workspaceId: string; sources: ConnectionSource[]; holders: Map<string, ConnectionHolders>;
  accessFor(provider: ConnectionProvider): ProviderAccess;
  eligibilityFor?(provider: ConnectionProvider, holders: ConnectionHolders): Promise<ProviderEligibility>;
}): Promise<WorkspaceConnectionsResult> {
  const results = await Promise.all(input.sources.map(async source => {
    try {
      const access = input.accessFor(source.provider);
      const rows = workspaceConnectionSchema.array().parse(await source.list({ workspaceId: input.workspaceId, access }));
      // Reject an entire bad source rather than leak another workspace or provider's row.
      if (rows.some(row => row.workspaceId !== input.workspaceId || row.provider !== source.provider || !row.ref.startsWith(`${source.provider}:`))) throw new Error("Connection source scope mismatch");
      return { provider: source.provider, rows: await Promise.all(rows.map(async row => {
        // A synthetic platform email service has no connected login or legacy
        // credential. Its source attests current sending policy, never delivery.
        const platformService = source.provider === "resend" && row.ref === `resend:${input.workspaceId}` &&
          row.accountHolder.kind === "platform" && row.accessThrough.kind === "platform";
        const holders = input.holders.get(row.ref) ?? (platformService ? { accountHolder: row.accountHolder, accessThrough: row.accessThrough } : UNKNOWN_CONNECTION_HOLDERS);
        const eligibility = input.eligibilityFor ? await input.eligibilityFor(source.provider, holders) : null;
        const unavailable = eligibility && !eligibility.eligible ? eligibility.reason :
          access.approval === "pending" ? "approval_pending" as const : access.approval === "none" || access.through.kind === "unknown" ? "not_configured" as const : null;
        const unknown = holders.accountHolder.kind === "unknown" || holders.accessThrough.kind === "unknown";
        const changedAccess = holders.accessThrough.kind !== access.through.kind ||
          (holders.accessThrough.kind === "agency" && access.through.kind === "agency" && holders.accessThrough.workspaceId !== access.through.workspaceId);
        return { ...row, ...holders, ...(unavailable ? { state: "unavailable" as const, unavailableReason: unavailable } :
          (unknown || changedAccess) && row.state === "connected" ? { state: "stale" as const } : {}) };
      })), failed: false };
    } catch { return { provider: source.provider, rows: [], failed: true }; }
  }));
  const connections = new Map<string, WorkspaceConnection>();
  const errors = new Set<ConnectionProvider>();
  for (const result of results) {
    if (result.failed) errors.add(result.provider);
    for (const row of result.rows) {
      if (connections.has(row.ref)) { errors.add(row.provider); continue; }
      connections.set(row.ref, row);
    }
  }
  return { connections: [...connections.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.ref.localeCompare(b.ref)), sourceErrors: [...errors].sort() };
}
