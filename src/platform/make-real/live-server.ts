/**
 * Server bindings for live Make real: the real write paths behind each
 * channel adapter, the Postgres repositories, the Needs you approval store
 * and the per-workspace flags. Server only. Every outside write here is a
 * call into the path that already owns it (live-adapters.ts has the table).
 */
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { getTenantConfig } from "@/lib/tenants";
import { getContent, getVersions, restoreVersion } from "@/lib/storage";
import type { ContentSection } from "@/lib/types";
import { applySectionUpdate } from "@/lib/apply-section-update";
import { PostgresNeedsYouStore } from "@/platform/needs-you/repository";
import { possibilitySchema, type MakeRealChannel, type Possibility } from "@/platform/possibilities/contracts";
import { createSupabasePossibilityRepository } from "@/platform/possibilities/supabase-repository";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { createNeedsYouApprovalRecords } from "./approvals";
import {
  createBookingPageAdapter,
  createHostedWebsiteAdapter,
  createInquiryFormAdapter,
  createInternalAppAdapter,
  createTenantContentAdapter,
  createWaitingAdapter,
  type LiveChannelContext,
} from "./live-adapters";
import { createLiveMakeRealService, createMakeRealNeedsYouAdapter } from "./live";
import { createSupabaseActivationRepository } from "./supabase-repository";
import { createSupabaseRevisionContent } from "./supabase-content";
import { createSystemStoreLiveSystems } from "./systems-adapter";

/** Systems must be on for the workspace, and the channel's own key. */
export async function makeRealChannelEnabled(workspaceId: string, channel: MakeRealChannel): Promise<boolean> {
  if (channel === "google_listing") return false;
  if (!(await workspaceReleaseFlagEnabled("systems", workspaceId))) return false;
  return workspaceReleaseFlagEnabled(`make_real_live:${channel}`, workspaceId);
}

/** Whether any live channel is on for this workspace: the route stays isolated otherwise. */
export async function anyMakeRealChannelEnabled(workspaceId: string): Promise<boolean> {
  for (const channel of ["hosted_website", "tenant_content", "inquiry_form", "booking_page", "internal_app"] as const) {
    if (await makeRealChannelEnabled(workspaceId, channel)) return true;
  }
  return false;
}

export function liveChannelAdapters(actor: WorkspaceActor, workspaceId: string) {
  const ctx: LiveChannelContext = { actor, enabled: (channel) => makeRealChannelEnabled(workspaceId, channel) };
  return [
    createHostedWebsiteAdapter({
      read: async (a, workId) => (await import("@/products/websites/rebuild-service")).readWebsiteRebuild(a, workId),
      approve: async (a, workId, selection) => (await import("@/products/websites/rebuild-service")).approveWebsiteRebuild(a, workId, selection),
      launch: async (a, workId, selection) => (await import("@/products/websites/rebuild-service")).launchWebsiteRebuild(a, workId, selection),
    }, ctx),
    createTenantContentAdapter({
      tenantConfig: async (tenantId) => (await getTenantConfig(tenantId)) ?? null,
      apply: (input) => applySectionUpdate({ ...input, section: input.section as ContentSection, tenantConfig: input.tenantConfig as Parameters<typeof applySectionUpdate>[0]["tenantConfig"] }),
      versions: async (section, tenantId) => (await getVersions(section as ContentSection, tenantId)).map((v) => ({ id: v.id, data: v.data, ...(v.requestId ? { requestId: v.requestId } : {}) })),
      content: (section, tenantId) => getContent(section as ContentSection, tenantId),
      restore: (section, versionId, tenantId) => restoreVersion(section as ContentSection, versionId, tenantId, "ai"),
    }, ctx),
    createInquiryFormAdapter({
      queue: async (input) => (await import("@/products/inquiries/server")).queueInquiryPublication(input),
      execute: async (input) => (await import("@/products/inquiries/publication")).executeInquiryPublication(input),
      claim: async (tenantId, claimId) => (await import("@/products/inquiries/repository")).getInquiryRepository().getPublicationClaim(tenantId, claimId),
    }, ctx),
    createBookingPageAdapter({
      publish: async (a, input) => (await import("@/products/scheduling/server")).publishPublicWebsiteBookingGrant(a, input),
      list: async (a, businessId) => (await import("@/products/scheduling/server")).listPublicWebsiteBookingGrants(a, businessId),
      revoke: async (a, input) => (await import("@/products/scheduling/server")).revokePublicWebsiteBookingGrant(a, input),
    }, ctx),
    createInternalAppAdapter({
      read: async (a, workId) => (await import("@/products/applications/server")).readApplication(a, workId),
      publish: async (a, workId, raw) => (await import("@/products/applications/server")).publishApplication(a, workId, raw),
      rollback: async (a, workId, raw) => (await import("@/products/applications/server")).rollbackApplication(a, workId, raw),
    }, ctx),
    createWaitingAdapter("google_listing", "Google hasn't approved Strelva's access yet. Strelva adds it when Google does."),
  ];
}

export const liveMakeReal = createLiveMakeRealService({
  possibilities: (actor) => createSupabasePossibilityRepository(actor),
  activations: (actor) => createSupabaseActivationRepository(actor),
  live: (actor) => createSystemStoreLiveSystems({ store: createSupabaseSystemStore(), content: createSupabaseRevisionContent(actor), actor }),
  adapters: liveChannelAdapters,
  approvals: createNeedsYouApprovalRecords({ read: (workspaceId, itemId) => PostgresNeedsYouStore.read(workspaceId, itemId) }),
});

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
function db(): Rpc {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Make real storage is unavailable.");
  return client as unknown as Rpc;
}

const readySchema = z.array(z.object({ possibility: z.unknown(), systems: z.array(z.object({ id: z.string(), name: z.string() })) }));

/** Ready possibilities not being made real, with the names of the Systems they pin, read without an actor. */
export async function readReadyPossibilitiesWithNames(workspaceId: string): Promise<{ possibilities: Possibility[]; names: Map<string, string> }> {
  const { data, error } = await db().rpc("read_ready_system_possibilities", { p_workspace_id: z.string().uuid().parse(workspaceId) });
  if (error) throw new WorkspaceStoreError("Ready possibilities could not be read.");
  const rows = readySchema.safeParse(data);
  if (!rows.success) throw new WorkspaceStoreError("Ready possibilities could not be read. The response was malformed.");
  const names = new Map<string, string>();
  const possibilities = rows.data.flatMap((row) => {
    for (const system of row.systems) names.set(system.id, system.name);
    const parsed = possibilitySchema.safeParse(row.possibility);
    return parsed.success && parsed.data.businessId === workspaceId ? [parsed.data] : [];
  });
  return { possibilities, names };
}

export async function readReadyPossibilities(workspaceId: string): Promise<Possibility[]> {
  return (await readReadyPossibilitiesWithNames(workspaceId)).possibilities;
}

const dueSchema = z.array(z.object({ workspaceId: z.string().uuid(), activationId: z.string(), userId: z.string().uuid(), email: z.string() }));
/** In-progress activations for the existing workspace-work cron. */
export async function listDueActivations(limit = 20): Promise<Array<{ workspaceId: string; activationId: string; actor: WorkspaceActor }>> {
  const { data, error } = await db().rpc("due_make_real_activations", { p_limit: limit, p_grace_seconds: 120 });
  if (error) throw new WorkspaceStoreError("Due activations could not be read.");
  const parsed = dueSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("Due activations could not be read. The response was malformed.");
  return parsed.data.map((row) => ({ workspaceId: row.workspaceId, activationId: row.activationId, actor: { userId: row.userId, verifiedEmail: row.email } }));
}

/**
 * The Make real source for Needs you. Exported for the Needs you stream to
 * add to `needsYouService` adapters; it opens items only where Systems and at
 * least one live channel are on.
 */
export const makeRealNeedsYouAdapter = createMakeRealNeedsYouAdapter({
  enabled: anyMakeRealChannelEnabled,
  readReady: readReadyPossibilities,
  systemNames: async (workspaceId) => (await readReadyPossibilitiesWithNames(workspaceId)).names,
  service: liveMakeReal,
});
