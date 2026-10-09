/**
 * Server bindings for live Make real: the real write paths behind each
 * channel adapter, the Postgres repositories, the Needs you approval store
 * and the per-workspace flags. Server only. Every outside write here is a
 * call into the path that already owns it (live-adapters.ts has the table).
 */
import { createGoogleListingAdapter } from "./google-adapter";
import type { GoogleMakeRealPorts } from "./google-adapter";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { getTenantConfig } from "@/lib/tenants";
import { getContent, getVersions, restoreVersion } from "@/lib/storage";
import type { ContentSection } from "@/lib/types";
import { applySectionUpdate } from "@/lib/apply-section-update";
import { possibilityPreviewPath } from "@/platform/possibilities/preview-link";
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
  type LiveChannelContext,
} from "./live-adapters";
import { createLiveMakeRealService, liveReadyPlan, startLiveApproved, type DueActivation } from "./live";
import { recordServiceAction, startServiceSession, type ServiceSession } from "@/platform/needs-you/service-actor";
import type { ReadyPlan } from "@/platform/needs-you/sources/make-real";
import { createSupabaseActivationRepository } from "./supabase-repository";
import { createSupabaseRevisionContent } from "./supabase-content";
import { createSystemStoreLiveSystems } from "./systems-adapter";

/** Systems must be on for the workspace, and the channel's own key. */
export async function makeRealChannelEnabled(workspaceId: string, channel: MakeRealChannel): Promise<boolean> {
  if (!(await workspaceReleaseFlagEnabled("systems", workspaceId))) return false;
  return workspaceReleaseFlagEnabled(`make_real_live:${channel}`, workspaceId);
}

/** Whether any live channel is on for this workspace: the route stays isolated otherwise. */
export async function anyMakeRealChannelEnabled(workspaceId: string): Promise<boolean> {
  for (const channel of ["hosted_website", "tenant_content", "inquiry_form", "booking_page", "internal_app", "google_listing"] as const) {
    if (await makeRealChannelEnabled(workspaceId, channel)) return true;
  }
  return false;
}

export function liveChannelAdapters(actor: WorkspaceActor, workspaceId: string, google: GoogleMakeRealPorts, service?: import("./live").LiveMakeRealServiceContext) {
  const ctx: LiveChannelContext = { actor, enabled: (channel) => makeRealChannelEnabled(workspaceId, channel) };
  return [
    createHostedWebsiteAdapter({
      read: async (a, workId) => (await import("@/products/websites/rebuild-service")).readWebsiteRebuild(a, workId),
      approve: async (a, workId, selection) => (await import("@/products/websites/rebuild-service")).approveWebsiteRebuild(a, workId, selection),
      launch: async (a, workId, selection) => (await import("@/products/websites/rebuild-service")).launchWebsiteRebuild(a, workId, selection),
      publishLinked: async (a, workId, selection) => (await import("@/products/websites/rebuild-service")).publishWebsiteRebuildOntoLinkedSite(a, workId, selection),
    }, ctx),
    createTenantContentAdapter({
      tenantConfig: async (tenantId) => (await getTenantConfig(tenantId)) ?? null,
      apply: (input) => applySectionUpdate({ ...input, section: input.section as ContentSection, tenantConfig: input.tenantConfig as Parameters<typeof applySectionUpdate>[0]["tenantConfig"] }),
      versions: async (section, tenantId) => (await getVersions(section as ContentSection, tenantId)).map((v) => ({ id: v.id, data: v.data, ...(v.requestId ? { requestId: v.requestId } : {}) })),
      content: (section, tenantId) => getContent(section as ContentSection, tenantId),
      publicReadBack: async (tenantId, section, expected) => {
        const tenant = await getTenantConfig(tenantId);
        if (!tenant) return { ok: false, detail: "The published site's address is unavailable." };
        return (await import("@/products/websites/rebuild-service")).readPublishedWebsiteContent({ tenant, section, expected });
      },
      restore: (section, versionId, tenantId) => restoreVersion(section as ContentSection, versionId, tenantId, "ai"),
    }, ctx),
    createInquiryFormAdapter({
      prepareFollowUp: async (a, selection) => (await import("@/products/inquiries/server")).approveAskInquiryFollowUpPublication(a, selection),
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
    createGoogleListingAdapter(service && google.forService ? google.forService(service) : google, ctx),
  ];
}

export function createServerLiveMakeReal(google: GoogleMakeRealPorts) {
  return createLiveMakeRealService({
    possibilities: (actor) => createSupabasePossibilityRepository(actor),
    activations: (actor) => createSupabaseActivationRepository(actor),
    live: (actor) => createSystemStoreLiveSystems({ store: createSupabaseSystemStore(), content: createSupabaseRevisionContent(actor), actor }),
    adapters: (actor, workspaceId, service) => liveChannelAdapters(actor, workspaceId, google, service),
    approvals: createNeedsYouApprovalRecords({ read: (workspaceId, itemId) => PostgresNeedsYouStore.read(workspaceId, itemId) }),
    recordService: recordServiceAction,
  });
}

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

/**
 * The identity an activation runs under: the owner whose approval started it
 * (the activation RPCs accept only a direct owner or admin). An operator's
 * resume, reconcile or rollback runs as that owner and names the operator in
 * the history event, so the log says who acted.
 */
export async function activationStarter(workspaceId: string, activationId: string): Promise<WorkspaceActor | null> {
  const client = getSupabase();
  if (!client) return null;
  const db = client as unknown as { from(table: string): { select(c: string): { eq(c: string, v: string): { eq(c: string, v: string): { eq(c: string, v: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }> } } } } } } };
  const row = await db.from("saved_product_work").select("created_by").eq("workspace_id", workspaceId).eq("product_id", "operations").eq("resource_kind", "activation").eq("payload->>id", activationId).maybeSingle();
  const userId = typeof row.data?.created_by === "string" ? row.data.created_by : null;
  if (row.error || !userId) return null;
  const users = client as unknown as { from(table: string): { select(c: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }> } } } };
  const user = await users.from("users").select("email").eq("id", userId).maybeSingle();
  return typeof user.data?.email === "string" ? { userId, verifiedEmail: user.data.email.toLowerCase() } : null;
}

const dueSchema = z.array(z.object({ workspaceId: z.string().uuid(), activationId: z.string(), starterUserId: z.string().uuid().nullable(), starterEmail: z.string().nullable() }));

/**
 * In-progress activations for the existing workspace-work cron, each with
 * who runs it: Strelva (system) for a business Strelva runs (one logged
 * `make_real_resume` session per business), else its starter while still an
 * owner or admin. One with neither is left for the operator queue.
 */
export async function listDueActivations(limit = 20, deps: { startSession?: typeof startServiceSession } = {}): Promise<DueActivation[]> {
  const { data, error } = await db().rpc("due_make_real_activations_for_service", { p_limit: limit, p_grace_seconds: 120 });
  if (error) throw new WorkspaceStoreError("Due activations could not be read.");
  const parsed = dueSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("Due activations could not be read. The response was malformed.");
  const start = deps.startSession ?? startServiceSession;
  const sessions = new Map<string, ServiceSession | null>();
  const due: DueActivation[] = [];
  for (const row of parsed.data) {
    if (!sessions.has(row.workspaceId)) sessions.set(row.workspaceId, await start(row.workspaceId, "make_real_resume").catch(() => null));
    const service = sessions.get(row.workspaceId) ?? null;
    if (service) due.push({ workspaceId: row.workspaceId, activationId: row.activationId, actor: service.actor, service });
    else if (row.starterUserId && row.starterEmail) due.push({ workspaceId: row.workspaceId, activationId: row.activationId, actor: { userId: row.starterUserId, verifiedEmail: row.starterEmail } });
  }
  return due;
}

/**
 * Who an operator's resume, reconcile or rollback runs as: Strelva (system)
 * for a business Strelva runs (logged, with the operator named), else the
 * starter as before. The owner's approval record is unchanged either way.
 */
export async function activationRunner(workspaceId: string, activationId: string, deps: { startSession?: typeof startServiceSession; starter?: typeof activationStarter } = {}): Promise<{ actor: WorkspaceActor; service: ServiceSession | null } | null> {
  const service = await (deps.startSession ?? startServiceSession)(workspaceId, "make_real_resume").catch(() => null);
  if (service) return { actor: service.actor, service };
  const actor = await (deps.starter ?? activationStarter)(workspaceId, activationId);
  return actor ? { actor, service: null } : null;
}

/**
 * Live plans for the one Make real Needs you source
 * (src/platform/needs-you/systems-sources.ts): stored Ready Possibilities,
 * only where Systems and at least one live channel are on. Each carries the
 * signed "Try it" link so an owner who never signs in can try it from the
 * email.
 */
export async function readLiveReadyPlans(workspaceId: string): Promise<ReadyPlan[]> {
  if (!(await anyMakeRealChannelEnabled(workspaceId))) return [];
  const { possibilities, names } = await readReadyPossibilitiesWithNames(workspaceId);
  return possibilities.map((p) => {
    let href: string | null = null;
    try { href = possibilityPreviewPath({ workspaceId, possibilityId: p.id, candidateRevision: p.candidateRevision }); } catch { href = null; }
    return liveReadyPlan(p, names, href);
  });
}

/** Start an approved live plan (the item id is the plan approval). */
export function startLiveMakeReal(google: GoogleMakeRealPorts, input: { actor: WorkspaceActor; workspaceId: string; possibilityId: string; approvalId: string; title: string; service?: ServiceSession }) {
  return startLiveApproved(createServerLiveMakeReal(google), input);
}
