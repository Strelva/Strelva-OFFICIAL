/** Read-only, pre-cleanup evidence for the real no-account Make real journey.
 * Never starts a service session, opens a decision, or calls a provider. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import { websiteRebuildCandidate } from "@/products/websites/rebuild-possibility";
import { systemGraphSchema } from "@/platform/systems/contracts";
import { existingSystemsSnapshotSchema, mergeBusinessSystems, systemsFromExisting } from "@/platform/systems/from-existing";
import { localSql } from "./journeys";

export function safeDiscoveryRead(error: { code?: string } | null) {
  return error ? { status: "unavailable" as const, code: /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(error.code ?? "") ? error.code : "unknown" }
    : { status: "read" as const };
}

export async function noLoginMakeRealDiscovery(admin: SupabaseClient, input: {
  workspaceId: string; tenantId: string; tenantStableId: string; workId: string; chaseStartedAt: string;
}, readSql: typeof localSql = localSql) {
  // The immutable action log deliberately has no service_role table grants.
  // Read it only through the existing disposable-loopback fixture connection.
  const native = readSql<{ sessions: Array<{ userId: string; providerId: string | null; email: string | null; verified: boolean; holds: boolean }>;
    tenantLinkCount: number; decisionStates: Array<{ state: string; outcome: string | null }> }>(`
    begin read only;
    select jsonb_build_object('sessions', coalesce((select jsonb_agg(x) from (
      select a.on_behalf_user_id as "userId", a.provider_workspace_id as "providerId", u.email, (u.verified_at is not null) as verified,
        public.platform_service_session_holds(a) as holds
      from public.strelva_service_actions a left join public.users u on u.id=a.on_behalf_user_id
      where a.workspace_id=:'v1'::uuid and a.purpose='needs_you_sync' and a.action='session'
        and a.created_at>=:'v2'::timestamptz order by a.created_at desc limit 5
    ) x), '[]'::jsonb), 'tenantLinkCount', (
      select count(*) from public.tenant_workspace_links where workspace_id=:'v1'::uuid and tenant_stable_id=:'v3'::uuid),
      'decisionStates', coalesce((select jsonb_agg(x) from (
        select state, outcome from public.owner_decisions where workspace_id=:'v1'::uuid and source_lifecycle='make_real'
          and source_id like ('website-rebuild:' || :'v4'::uuid::text || '@%') order by opened_at desc limit 10
      ) x), '[]'::jsonb));
    rollback;
  `, input.workspaceId, input.chaseStartedAt, input.tenantStableId, input.workId);
  const work = await
    admin.from("saved_product_work").select("id,product_id,resource_kind,title,payload")
      .eq("workspace_id", input.workspaceId).eq("id", input.workId).maybeSingle();
  const parsed = websiteRebuildSchema.safeParse(work.data?.payload);
  const candidate = work.data ? websiteRebuildCandidate({ id: work.data.id, productId: work.data.product_id,
    resourceKind: work.data.resource_kind, title: work.data.title, payload: work.data.payload }) : null;
  const base = {
    serviceSessions: { status: "read" as const, count: native.sessions.length,
      limit: 5, providerRecorded: native.sessions[0]?.providerId != null, currentAuthorityHolds: native.sessions[0]?.holds ?? null },
    tenantLink: { status: "read" as const, count: native.tenantLinkCount },
    makeRealDecisions: { states: native.decisionStates, limit: 10 },
    rebuild: { ...safeDiscoveryRead(work.error), present: work.data != null, valid: parsed.success,
      status: parsed.success ? parsed.data.status : null, readyCandidate: candidate?.ready ?? false,
      candidateTargetsTenant: candidate?.tenantId === input.tenantId },
  };
  const identity = native.sessions[0];
  if (!identity) return { ...base, projection: { status: "not_read_no_admitted_session" as const } };
  if (!identity.holds) return { ...base, projection: { status: "not_read_session_no_longer_authorized" as const } };
  if (!identity.verified || !identity.email) return { ...base, projection: { status: "not_read_identity_unavailable" as const } };
  const args = { p_workspace_id: input.workspaceId, p_user_id: identity.userId, p_verified_email: identity.email };
  const [graph, existing] = await Promise.all([
    admin.rpc("read_business_systems", args), admin.rpc("read_existing_business_systems", args),
  ]);
  const parsedGraph = systemGraphSchema.safeParse(graph.data);
  const parsedExisting = existingSystemsSnapshotSchema.safeParse(existing.data);
  if (graph.error || existing.error || !parsedGraph.success || !parsedExisting.success) return {
    ...base, projection: { status: "unavailable" as const, graph: safeDiscoveryRead(graph.error), existing: safeDiscoveryRead(existing.error),
      graphValid: parsedGraph.success, existingValid: parsedExisting.success },
  };
  const listing = mergeBusinessSystems(parsedGraph.data, systemsFromExisting(parsedExisting.data));
  return { ...base, projection: { status: "read" as const, scope: parsedExisting.data.scope,
    websiteCount: listing.systems.filter(item => item.system.kind === "website").length,
    boundWebsiteCount: listing.systems.filter(item => item.system.kind === "website" && item.references.tenantId === input.tenantId).length } };
}
