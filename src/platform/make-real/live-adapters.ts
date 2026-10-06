import { z } from "zod";
import type { DeclaredEffect, MakeRealChannel, Reversibility } from "@/platform/possibilities/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { EffectAdapter, EffectPerformResult } from "./ports";

/**
 * LIVE effect adapters (systems-experience spec section 5). Each one wraps the
 * write path that owns that change today; none is a second write path:
 *
 * | Channel        | Wraps                                   | Read-back              | Undo                                  |
 * | hosted_website | websiteRebuildService.launch            | the launch read-back   | needs review (earlier version as a draft) |
 * | tenant_content | applySectionUpdate (ai-governance)      | read the section back  | restoreVersion to the previous version |
 * | inquiry_form   | queue + executeInquiryPublication       | the claim's status     | an `undo` publication; inquiries kept |
 * | booking_page   | publishPublicWebsiteBookingGrant        | read the grant back    | revoke; existing bookings kept        |
 * | internal_app   | publishApplication                      | the current release    | rollbackApplication                   |
 *
 * Every adapter is `mode: "live"` and serves only effects that name its
 * channel. Each checks its own per-workspace flag (`make_real_live:<channel>`)
 * in `ready`, so a channel that is off leaves the step Waiting, never
 * attempted. A precondition the adapter can check without writing is
 * refused before the write; anything thrown during the write leaves the step
 * unknown for the runner (never replayed, reconciled by `find`).
 *
 * The ports are the narrow slice of each write path; live-server.ts binds the
 * real modules and tests bind fakes.
 */

export interface LiveChannelContext {
  /** Who the writes run as: the owner whose approval started the activation. */
  actor: WorkspaceActor;
  /** The per-workspace `make_real_live:<channel>` flag, read at call time. */
  enabled(channel: MakeRealChannel): Promise<boolean>;
}

export const CHANNEL_LABEL: Record<MakeRealChannel, string> = {
  hosted_website: "the hosted website",
  tenant_content: "website sections",
  inquiry_form: "the inquiry form",
  booking_page: "the booking page",
  internal_app: "the internal app",
  google_listing: "the Google listing",
};

function base(channel: MakeRealChannel, ctx: LiveChannelContext | null, reversibility: Reversibility, idempotentByKey: boolean) {
  return {
    kind: "publish" as const,
    mode: "live" as const,
    channel,
    idempotentByKey,
    reversibility: (_effect: DeclaredEffect) => reversibility,
    /** Exploring never reaches a live adapter (rehearsePossibility refuses it). */
    async rehearse() { return { ok: false, detail: "A live adapter never rehearses. Exploring uses isolated adapters." }; },
    async ready(): Promise<{ ok: true } | { ok: false; reason: string }> {
      if (!ctx) return { ok: false, reason: `${CHANNEL_LABEL[channel]} is not connected to Make real.` };
      return (await ctx.enabled(channel)) ? { ok: true } : { ok: false, reason: `Make real is not live for ${CHANNEL_LABEL[channel]} in this business yet. Strelva turns it on.` };
    },
  };
}

function rejected(reason: string): EffectPerformResult {
  return { status: "rejected", reason: reason.slice(0, 2000) };
}

function parseRequest<T>(schema: z.ZodType<T>, effect: DeclaredEffect | undefined): T | null {
  const parsed = schema.safeParse(effect?.request);
  return parsed.success ? parsed.data : null;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message.slice(0, 1000) : fallback;
}

// Hosted website -------------------------------------------------------------------

export const hostedWebsiteRequestSchema = z.object({
  workId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  candidateRevision: z.number().int().positive(),
  candidateContentHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export interface HostedWebsitePorts {
  read(actor: WorkspaceActor, workId: string): Promise<{ rebuild: {
    status: string; approvedCandidateRevision: number | null; tenantId: string | null;
    launch: { receipt: { receiptId: string; candidateRevision: number; providerUrl: string } | null; readBack: { status: string; message: string } | null };
  } }>;
  launch(actor: WorkspaceActor, workId: string, selection: { expectedRevision: number; candidateRevision: number; candidateContentHash: string }): Promise<{ rebuild: {
    launch: { receipt: { receiptId: string; candidateRevision: number; providerUrl: string } | null; readBack: { status: string; message: string } | null };
  } }>;
}

export function createHostedWebsiteAdapter(ports: HostedWebsitePorts, ctx: LiveChannelContext): EffectAdapter {
  const ref = (workId: string, receiptId: string) => `${workId}:${receiptId}`;
  const split = (providerRef: string) => { const at = providerRef.indexOf(":"); return { workId: providerRef.slice(0, at), receiptId: providerRef.slice(at + 1) }; };
  return {
    ...base("hosted_website", ctx, "compensable", true),
    async perform({ effect }) {
      const req = parseRequest(hostedWebsiteRequestSchema, effect);
      if (!req) return rejected("This effect does not name an approved website candidate.");
      const current = await ports.read(ctx.actor, req.workId);
      if (current.rebuild.status !== "approved" && current.rebuild.launch.receipt?.candidateRevision !== req.candidateRevision) {
        return rejected("The rebuilt site is not approved for launch yet. Nothing was published.");
      }
      if (current.rebuild.approvedCandidateRevision !== null && current.rebuild.approvedCandidateRevision !== req.candidateRevision) {
        return rejected("A different version of the site was approved. Nothing was published.");
      }
      const launched = await ports.launch(ctx.actor, req.workId, { expectedRevision: req.expectedRevision, candidateRevision: req.candidateRevision, candidateContentHash: req.candidateContentHash });
      const receipt = launched.rebuild.launch.receipt;
      if (!receipt || receipt.candidateRevision !== req.candidateRevision) return rejected("The launch returned no receipt for this version.");
      return { status: "accepted", providerRef: ref(req.workId, receipt.receiptId), result: { receiptId: receipt.receiptId, providerUrl: receipt.providerUrl, candidateRevision: receipt.candidateRevision, tenantId: current.rebuild.tenantId } };
    },
    async find({ effect }) {
      const req = parseRequest(hostedWebsiteRequestSchema, effect);
      if (!req) return null;
      const record = await ports.read(ctx.actor, req.workId);
      const receipt = record.rebuild.launch.receipt;
      return receipt && receipt.candidateRevision === req.candidateRevision ? { found: true, providerRef: ref(req.workId, receipt.receiptId) } : { found: false };
    },
    async readBack({ providerRef }) {
      const { workId, receiptId } = split(providerRef);
      const record = await ports.read(ctx.actor, workId);
      const { receipt, readBack } = record.rebuild.launch;
      if (!receipt || receipt.receiptId !== receiptId) return { ok: false, detail: "The published version is no longer this one." };
      return { ok: readBack?.status === "verified", detail: readBack?.message ?? "The site has not been checked yet." };
    },
    async compensate() {
      // Restoring the earlier site is a new publish, so it routes as
      // undo_needs_review from History, never as an automatic write.
      return { ok: false, detail: "Undo needs review: Strelva saves the earlier site as a new draft for approval, from History." };
    },
  };
}

// Tenant content section ---------------------------------------------------------

export const tenantContentRequestSchema = z.object({
  tenantId: z.string().min(1).max(120),
  section: z.string().min(1).max(40),
  data: z.record(z.string(), z.unknown()),
}).strict();

export interface TenantContentPorts {
  tenantConfig(tenantId: string): Promise<unknown | null>;
  apply(input: { tenantId: string; section: string; data: Record<string, unknown>; tenantConfig: unknown; requestId: string }): Promise<{ status: "published" | "queued" | "blocked" | "failed"; message?: string; error?: string }>;
  /** Newest first. */
  versions(section: string, tenantId: string): Promise<Array<{ id: string; requestId?: string; data?: unknown }>>;
  content(section: string, tenantId: string): Promise<unknown>;
  restore(section: string, versionId: string, tenantId: string): Promise<{ id: string } | null>;
}

function contains(actual: unknown, expected: Record<string, unknown>): boolean {
  if (!actual || typeof actual !== "object") return false;
  return Object.entries(expected).every(([key, value]) => JSON.stringify((actual as Record<string, unknown>)[key]) === JSON.stringify(value));
}

export function createTenantContentAdapter(ports: TenantContentPorts, ctx: LiveChannelContext): EffectAdapter {
  const ref = (tenantId: string, section: string, versionId: string) => [tenantId, section, versionId].join("|");
  const split = (providerRef: string) => { const [tenantId = "", section = "", versionId = ""] = providerRef.split("|"); return { tenantId, section, versionId }; };
  return {
    ...base("tenant_content", ctx, "compensable", false),
    async perform({ effect, idempotencyKey }) {
      const req = parseRequest(tenantContentRequestSchema, effect);
      if (!req || effect.publish?.section !== req.section) return rejected("This effect does not name the website section it publishes.");
      const tenantConfig = await ports.tenantConfig(req.tenantId);
      if (!tenantConfig) return rejected("That website is not available.");
      const result = await ports.apply({ tenantId: req.tenantId, section: req.section, data: req.data, tenantConfig, requestId: idempotencyKey });
      if (result.status === "queued") return rejected("Strelva's content review held this change. It waits in review; nothing went live.");
      if (result.status !== "published") return rejected(result.message ?? result.error ?? "The section was not published.");
      const version = (await ports.versions(req.section, req.tenantId).catch(() => [])).find((v) => v.requestId === idempotencyKey);
      return { status: "accepted", providerRef: ref(req.tenantId, req.section, version?.id ?? idempotencyKey), result: { tenantId: req.tenantId, section: req.section } };
    },
    async find({ effect, idempotencyKey }) {
      const req = parseRequest(tenantContentRequestSchema, effect);
      if (!req) return null;
      const version = (await ports.versions(req.section, req.tenantId)).find((v) => v.requestId === idempotencyKey);
      return version ? { found: true, providerRef: ref(req.tenantId, req.section, version.id) } : { found: false };
    },
    async readBack({ providerRef }) {
      const { tenantId, section, versionId } = split(providerRef);
      const versions = await ports.versions(section, tenantId);
      const ours = versions.find((v) => v.id === versionId);
      if (!ours) return { ok: false, detail: "The published version could not be found in the section's history." };
      const live = await ports.content(section, tenantId);
      const expected = ours.data;
      if (expected && typeof expected === "object" && !contains(live, expected as Record<string, unknown>)) return { ok: false, detail: "The live section differs from what was published." };
      return { ok: true, detail: `The ${section} section reads back as published.` };
    },
    async compensate({ providerRef }) {
      const { tenantId, section, versionId } = split(providerRef);
      const versions = await ports.versions(section, tenantId);
      const index = versions.findIndex((v) => v.id === versionId);
      const previous = index >= 0 ? versions[index + 1] : undefined;
      if (index > 0) return { ok: false, detail: "The section changed again after this publish. Restore it from History after a look." };
      if (!previous) return { ok: false, detail: "There is no earlier version of this section to restore." };
      const restored = await ports.restore(section, previous.id, tenantId);
      return restored ? { ok: true, detail: `Restored the previous ${section} section.` } : { ok: false, detail: "The previous version could not be restored." };
    },
  };
}

// Inquiry form -------------------------------------------------------------------

export const inquiryFormRequestSchema = z.object({
  tenantId: z.string().min(1).max(120),
  businessId: z.string().min(1).max(160),
  requestId: z.string().min(1).max(200),
  capabilityId: z.string().min(1).max(120),
  changeId: z.string().min(1).max(200),
  version: z.number().int().positive(),
}).strict();

type InquiryClaim = { id: string; status: string; tenantId: string; businessId: string; requestId: string; capabilityId: string; changeId: string; version: number };

export interface InquiryFormPorts {
  queue(input: z.infer<typeof inquiryFormRequestSchema> & { action: "make_live" | "undo"; idempotencyKey: string; actorId: string }): Promise<{ claim: InquiryClaim; acquired: boolean; reason?: string; eventId: string | null }>;
  execute(input: { tenantId: string; eventId: string; claimId: string }): Promise<{ accepted: boolean; verified: boolean; reason?: string }>;
  claim(tenantId: string, claimId: string): Promise<InquiryClaim | null>;
}

const ACCEPTED_CLAIM = new Set(["accepted", "verification_failed"]);

export function createInquiryFormAdapter(ports: InquiryFormPorts, ctx: LiveChannelContext): EffectAdapter {
  const ref = (tenantId: string, claimId: string) => `${tenantId}|${claimId}`;
  const split = (providerRef: string) => { const [tenantId = "", claimId = ""] = providerRef.split("|"); return { tenantId, claimId }; };
  async function publish(req: z.infer<typeof inquiryFormRequestSchema>, action: "make_live" | "undo", key: string) {
    const queued = await ports.queue({ ...req, action, idempotencyKey: key, actorId: ctx.actor.userId });
    if (ACCEPTED_CLAIM.has(queued.claim.status)) return { accepted: true, claim: queued.claim };
    if (queued.claim.status === "failed") return { accepted: false, claim: queued.claim, reason: "An earlier attempt with this key was refused." };
    if (!queued.eventId) return { accepted: false, claim: queued.claim, reason: queued.reason ?? "The publication could not be queued." };
    const result = await ports.execute({ tenantId: req.tenantId, eventId: queued.eventId, claimId: queued.claim.id });
    return { accepted: result.accepted, claim: queued.claim, reason: result.reason };
  }
  return {
    ...base("inquiry_form", ctx, "compensable", true),
    async perform({ effect, idempotencyKey }) {
      const req = parseRequest(inquiryFormRequestSchema, effect);
      if (!req) return rejected("This effect does not name the inquiry form change it publishes.");
      const result = await publish(req, "make_live", idempotencyKey);
      if (!result.accepted) return rejected(result.reason ?? "The inquiry form was not published.");
      return { status: "accepted", providerRef: ref(req.tenantId, result.claim.id), result: { claimId: result.claim.id } };
    },
    async find({ effect, idempotencyKey }) {
      const req = parseRequest(inquiryFormRequestSchema, effect);
      if (!req) return null;
      // The claim is keyed by the step's idempotency key; asking again creates
      // at most the claim row, never a publication.
      const queued = await ports.queue({ ...req, action: "make_live", idempotencyKey, actorId: ctx.actor.userId });
      return ACCEPTED_CLAIM.has(queued.claim.status) ? { found: true, providerRef: ref(req.tenantId, queued.claim.id) } : { found: false };
    },
    async readBack({ providerRef }) {
      const { tenantId, claimId } = split(providerRef);
      const claim = await ports.claim(tenantId, claimId);
      if (!claim) return { ok: false, detail: "The publication claim could not be read." };
      return claim.status === "accepted" ? { ok: true, detail: "The inquiry form is live." } : { ok: false, detail: `The publication reads ${claim.status.replace("_", " ")}.` };
    },
    async compensate({ providerRef, idempotencyKey }) {
      const { tenantId, claimId } = split(providerRef);
      const claim = await ports.claim(tenantId, claimId);
      if (!claim) return { ok: false, detail: "The publication claim could not be read." };
      try {
        const result = await publish({ tenantId: claim.tenantId, businessId: claim.businessId, requestId: claim.requestId, capabilityId: claim.capabilityId, changeId: claim.changeId, version: claim.version }, "undo", idempotencyKey);
        return result.accepted ? { ok: true, detail: "The previous inquiry form is live again. Inquiries already received are kept." } : { ok: false, detail: result.reason ?? "The previous form was not restored." };
      } catch (error) {
        return { ok: false, detail: message(error, "The previous form was not restored.") };
      }
    },
  };
}

// Booking page -------------------------------------------------------------------

export const bookingPageRequestSchema = z.object({
  businessId: z.string().uuid(),
  tenantId: z.string().min(1).max(120),
  workId: z.string().uuid(),
  capabilityId: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  capabilityVersion: z.number().int().positive(),
  inquiryCapabilityId: z.string().min(1).max(80),
  inquiryVersion: z.number().int().positive(),
  provider: z.enum(["outlook", "google"]),
  displayName: z.string().min(1).max(160),
  timeZone: z.string().min(1).max(128),
}).strict();

type GrantRow = Record<string, unknown>;
export interface BookingPagePorts {
  publish(actor: WorkspaceActor, input: z.infer<typeof bookingPageRequestSchema>): Promise<GrantRow>;
  list(actor: WorkspaceActor, businessId: string): Promise<GrantRow | GrantRow[]>;
  revoke(actor: WorkspaceActor, input: { businessId: string; grantId: string; reason: string }): Promise<unknown>;
}

export function createBookingPageAdapter(ports: BookingPagePorts, ctx: LiveChannelContext): EffectAdapter {
  const rows = async (businessId: string) => { const value = await ports.list(ctx.actor, businessId); return Array.isArray(value) ? value : [value]; };
  const ref = (businessId: string, grantId: string) => `${businessId}|${grantId}`;
  const split = (providerRef: string) => { const [businessId = "", grantId = ""] = providerRef.split("|"); return { businessId, grantId }; };
  return {
    // The grant is unique per (site, capability), so a replay cannot add a second.
    ...base("booking_page", ctx, "compensable", true),
    async perform({ businessId, effect }) {
      const req = parseRequest(bookingPageRequestSchema, effect);
      if (!req || req.businessId !== businessId) return rejected("This effect does not name a booking page of this business.");
      const grant = await ports.publish(ctx.actor, req);
      const id = typeof grant.id === "string" ? grant.id : null;
      if (!id || grant.status !== "published") return rejected("The booking page was not published.");
      return { status: "accepted", providerRef: ref(businessId, id), result: { grantId: id } };
    },
    async find({ businessId, effect }) {
      const req = parseRequest(bookingPageRequestSchema, effect);
      if (!req) return null;
      const grant = (await rows(businessId)).find((row) => row.capability_id === req.capabilityId && row.capability_version === req.capabilityVersion
        && row.work_id === req.workId && row.status === "published");
      return grant && typeof grant.id === "string" ? { found: true, providerRef: ref(businessId, grant.id) } : { found: false };
    },
    async readBack({ providerRef }) {
      const { businessId, grantId } = split(providerRef);
      const grant = (await rows(businessId)).find((row) => row.id === grantId);
      return grant?.status === "published" ? { ok: true, detail: "The booking page is published." } : { ok: false, detail: grant ? `The booking page reads ${String(grant.status)}.` : "The booking page could not be found." };
    },
    async compensate({ providerRef }) {
      const { businessId, grantId } = split(providerRef);
      try {
        await ports.revoke(ctx.actor, { businessId, grantId, reason: "Make real was rolled back." });
        return { ok: true, detail: "The booking page is off. Bookings already made are kept." };
      } catch (error) {
        return { ok: false, detail: message(error, "The booking page could not be revoked.") };
      }
    },
  };
}

// Internal app -------------------------------------------------------------------

export const internalAppRequestSchema = z.object({
  workId: z.string().uuid(),
  expectedCandidateRevision: z.number().int().nonnegative(),
  expectedReleaseVersion: z.number().int().positive().nullable(),
}).strict();

type AppState = { payload: { release?: { version: number } | null; releases?: Array<{ version: number }>; designRevision?: number } };
export interface InternalAppPorts {
  read(actor: WorkspaceActor, workId: string): Promise<AppState>;
  publish(actor: WorkspaceActor, workId: string, raw: { expectedCandidateRevision: number; expectedReleaseVersion: number | null }): Promise<AppState>;
  rollback(actor: WorkspaceActor, workId: string, raw: { expectedDesignRevision: number; expectedReleaseVersion: number | null; version: number }): Promise<AppState>;
}

export function createInternalAppAdapter(ports: InternalAppPorts, ctx: LiveChannelContext): EffectAdapter {
  const ref = (workId: string, version: number) => `${workId}@v${version}`;
  const split = (providerRef: string) => { const at = providerRef.lastIndexOf("@v"); return { workId: providerRef.slice(0, at), version: Number(providerRef.slice(at + 2)) }; };
  return {
    // Publishing is compare-and-set on the release version, so a replay cannot release twice.
    ...base("internal_app", ctx, "compensable", true),
    async perform({ effect }) {
      const req = parseRequest(internalAppRequestSchema, effect);
      if (!req) return rejected("This effect does not name the app release it publishes.");
      const current = await ports.read(ctx.actor, req.workId);
      if ((current.payload.release?.version ?? null) !== req.expectedReleaseVersion) return rejected("The app's live release changed since this was built. Nothing was released.");
      const published = await ports.publish(ctx.actor, req.workId, { expectedCandidateRevision: req.expectedCandidateRevision, expectedReleaseVersion: req.expectedReleaseVersion });
      const version = published.payload.release?.version;
      if (!version || version === req.expectedReleaseVersion) return rejected("The release did not change.");
      return { status: "accepted", providerRef: ref(req.workId, version), result: { version, previous: req.expectedReleaseVersion } };
    },
    async find({ effect }) {
      const req = parseRequest(internalAppRequestSchema, effect);
      if (!req) return null;
      const version = (await ports.read(ctx.actor, req.workId)).payload.release?.version ?? null;
      return version !== null && version > (req.expectedReleaseVersion ?? 0) ? { found: true, providerRef: ref(req.workId, version) } : { found: false };
    },
    async readBack({ providerRef }) {
      const { workId, version } = split(providerRef);
      const current = (await ports.read(ctx.actor, workId)).payload.release?.version ?? null;
      return current === version ? { ok: true, detail: `Release ${version} is live.` } : { ok: false, detail: `The live release is ${current ?? "none"}, not ${version}.` };
    },
    async compensate({ providerRef }) {
      const { workId, version } = split(providerRef);
      const state = await ports.read(ctx.actor, workId);
      if ((state.payload.release?.version ?? null) !== version) return { ok: false, detail: "The app was released again after this. Roll it back from History after a look." };
      const previous = (state.payload.releases ?? []).map((r) => r.version).filter((v) => v < version).sort((a, b) => b - a)[0];
      if (!previous) return { ok: false, detail: "This was the app's first release; there is nothing earlier to return to." };
      try {
        await ports.rollback(ctx.actor, workId, { expectedDesignRevision: state.payload.designRevision ?? 0, expectedReleaseVersion: version, version: previous });
        return { ok: true, detail: `Release ${previous} is live again.` };
      } catch (error) {
        return { ok: false, detail: message(error, "The app could not be rolled back.") };
      }
    },
  };
}

// Not connected ------------------------------------------------------------------

/**
 * A channel Make real names but cannot write to yet (Google until Strelva's
 * API access is approved). Make real can start; this step waits, with who
 * unblocks it, and is never attempted.
 */
export function createWaitingAdapter(channel: MakeRealChannel, reason: string): EffectAdapter {
  return {
    ...base(channel, null, "irreversible", false),
    async ready() { return { ok: false, reason }; },
    async perform() { return rejected(reason); },
    async find() { return null; },
    async readBack() { return { ok: false, detail: reason }; },
  };
}
