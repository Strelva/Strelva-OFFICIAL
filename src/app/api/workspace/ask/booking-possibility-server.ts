import { z } from "zod";
import { AskPossibilityUnsupportedError, type AskPossibilityInput } from "@/platform/ask/ports";
import { listBusinessSystems } from "@/platform/systems/from-existing";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { systemOriginId } from "@/platform/systems";
import type { SystemListing } from "@/platform/systems/from-existing";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readWebsiteRebuild, listWebsiteRebuildCapabilityOptions, prepareWebsiteBookingPage, websiteRebuildReleasedFor } from "@/products/websites/index";
import { listPublicWebsiteBookingGrants, listWorkspaceCalendarConnections, readWorkspaceSchedule } from "@/products/scheduling/server";
import { publicBookingScheduleSchema } from "@/products/scheduling/server";

async function target(actor: WorkspaceActor, workspaceId: string, systemId: string): Promise<SystemListing | undefined> {
  const listing = await listBusinessSystems(actor, workspaceId, { store: createSupabaseSystemStore() });
  return listing.systems.find(item => item.system.id === systemId || item.references.tenantStableId && systemOriginId(workspaceId, { kind: "tenant", ref: item.references.tenantStableId }) === systemId);
}

/** A new visitor page for this site's existing configured service; no new grant or schedule. */
export async function prepareExistingAskBookingPage(actor: WorkspaceActor, input: AskPossibilityInput, dependencies: {
  target?: typeof target; read?: typeof readWebsiteRebuild; options?: typeof listWebsiteRebuildCapabilityOptions;
  grants?: typeof listPublicWebsiteBookingGrants; calendars?: typeof listWorkspaceCalendarConnections;
  schedule?: typeof readWorkspaceSchedule; prepare?: typeof prepareWebsiteBookingPage; now?: () => number;
  released?: typeof websiteRebuildReleasedFor;
} = {}) {
  if (!await (dependencies.released ?? websiteRebuildReleasedFor)(actor, input.workspaceId)) throw new AskPossibilityUnsupportedError("Booking-page preparation is not enabled for this business.");
  if (input.candidate?.kind !== "existing-booking-page" || !input.systemId) throw new AskPossibilityUnsupportedError("A booking page needs one existing native website and its unchanged stored System baseline.");
  const site = await (dependencies.target ?? target)(actor, input.workspaceId, input.systemId);
  const workId = site?.references.savedWorkId;
  const pointer = site?.system.currentRevision;
  if (!site || site.provenance !== "stored" || site.system.kind !== "website" || !workId || !pointer || pointer.businessId !== input.workspaceId || pointer.systemId !== site.system.id || !site.references.tenantId || !site.references.tenantStableId) throw new AskPossibilityUnsupportedError("This website has no stored native baseline for a safe page change. Strelva needs to prepare that first.");
  const record = await (dependencies.read ?? readWebsiteRebuild)(actor, workId);
  if (record.workspaceId !== input.workspaceId || record.rebuild.status !== "published" || !record.rebuild.candidate) throw new AskPossibilityUnsupportedError("Finish the website's current draft before opening a booking-page alternative.");
  const options = await (dependencies.options ?? listWebsiteRebuildCapabilityOptions)(actor, workId);
  const own = options.tenants.find(item => item.tenantId === site.references.tenantId);
  const matching = own?.booking.filter(item => !input.candidate || input.candidate.kind !== "existing-booking-page" || !input.candidate.bookingGrantId || item.grantId === input.candidate.bookingGrantId) ?? [];
  if (matching.length !== 1) throw new AskPossibilityUnsupportedError("Choose one already published booking service for this same website; Strelva cannot invent or borrow its grant.");
  const selected = matching[0]!;
  const rows = await (dependencies.grants ?? listPublicWebsiteBookingGrants)(actor, input.workspaceId);
  const grant = z.object({ id: z.string().uuid(), tenant_stable_id: z.string().uuid(), work_id: z.string().uuid(), status: z.literal("published"), capability_id: z.string(), capability_version: z.number().int().positive(), inquiry_capability_id: z.string(), inquiry_version: z.number().int().positive(), provider: z.enum(["google", "outlook"]), display_name: z.string(), time_zone: z.string() }).passthrough().safeParse((Array.isArray(rows) ? rows : [rows]).find(item => item.id === selected.grantId));
  if (!grant.success || grant.data.tenant_stable_id !== site.references.tenantStableId || grant.data.capability_id !== selected.capabilityId || grant.data.capability_version !== selected.version) throw new AskPossibilityUnsupportedError("The site's booking grant changed or belongs to another tenant.");
  const inquiry = own?.inquiry.find(item => item.capabilityId === grant.data.inquiry_capability_id && item.version === grant.data.inquiry_version);
  const calendars = await (dependencies.calendars ?? listWorkspaceCalendarConnections)(actor, input.workspaceId);
  if (!inquiry || !calendars.some(item => item.provider === grant.data.provider && item.status === "connected" && item.timeZone === grant.data.time_zone)) throw new AskPossibilityUnsupportedError("The site's matching inquiry capability and configured calendar must both be current before a booking page can work.");
  const schedule = await (dependencies.schedule ?? readWorkspaceSchedule)(actor, grant.data.work_id);
  if (schedule.workspaceId !== input.workspaceId || schedule.payload.pause) throw new AskPossibilityUnsupportedError("This booking schedule is unavailable or paused.");
  const now = (dependencies.now ?? Date.now)();
  const slots = schedule.payload.availability.filter(slot => Date.parse(slot.start) > now && !schedule.payload.reservations.some(held => held.status !== "cancelled" && Date.parse(held.start) < Date.parse(slot.end) && Date.parse(held.end) > Date.parse(slot.start))).slice(0,20).map((slot, index) => ({ id: `test-slot-${index}`, start: slot.start, end: slot.end }));
  if (!slots.length) throw new AskPossibilityUnsupportedError("This schedule has no configured future test times. Strelva needs to prepare availability first.");
  const bookingSchedule = publicBookingScheduleSchema.parse({ schemaVersion: 1, capabilityId: selected.capabilityId, version: selected.version, name: grant.data.display_name, provider: grant.data.provider, timeZone: grant.data.time_zone, slots });
  const candidate = record.rebuild.candidate;
  const prepared = await (dependencies.prepare ?? prepareWebsiteBookingPage)(actor, workId, {
    expectedRevision: record.rebuild.revision, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash,
    selection: { tenantId: own!.tenantId, bookingGrantId: selected.grantId, inquiryCapabilityId: inquiry.capabilityId },
    path: input.candidate.path, title: input.candidate.title, description: input.candidate.description,
  });
  const next = prepared.rebuild.candidate!;
  const content = { kind: "ask-existing-booking-page", rebuildWorkId: workId, contextSystemId: site.system.id, candidateRevision: next.revision, candidateContentHash: next.contentHash, document: next.document, bookingSchedule, bookingPath: input.candidate.path, grantId: selected.grantId, originalWords: input.words?.slice(0,3000) ?? input.intent, askOrigin: input.origin ?? null, askedOnBehalf: input.askedOnBehalf ?? null };
  return {
    content, previewHref: next.previewHref,
    changes: [{ baseline: pointer, candidate: { summary: input.introduces?.summary ?? input.title, content } }],
    effects: [{ id: "publish-booking-page", kind: "publish" as const, channel: "hosted_website" as const, system: { systemId: site.system.id }, description: `Publish ${input.candidate.title}`, request: { workId, candidateRevision: next.revision, candidateContentHash: next.contentHash }, after: [] }],
  };
}
