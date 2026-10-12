import { getSupabase } from "@/platform/infra/db/client";

/**
 * Direct-door funnel (ADR 0015): check run → check saved → business created →
 * first thing live. Fire-and-forget: measurement never blocks or fails the
 * step it measures. One row per step per reference; no personal data.
 */
export type FunnelStep = "check_run" | "check_saved" | "business_created" | "first_live";

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }> };
export async function recordFunnelEvent(step: FunnelStep, ref: string, scope: { workspaceId?: string | null; agencyWorkspaceId?: string | null } = {},
  client: Rpc | null = getSupabase() as unknown as Rpc | null): Promise<void> {
  if (!client || !/^[A-Za-z0-9][A-Za-z0-9_:.-]{0,159}$/.test(ref)) return;
  try {
    await client.rpc("record_funnel_event", { p_step: step, p_ref: ref, p_workspace_id: scope.workspaceId ?? null, p_agency_workspace_id: scope.agencyWorkspaceId ?? null });
  } catch { /* measurement only */ }
}
