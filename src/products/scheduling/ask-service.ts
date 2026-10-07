import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import { boundedStore, initial } from "@/platform/bounded-work/repository";
import { PostgresOfferingStore } from "@/platform/offerings/store";
import type { WorkspaceActor, SavedWork } from "@/platform/workspaces/types";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { readPublicBookingTenant } from "./public-booking-server";
import { readInquiryWorkspace, projectPublishedInquiry, validateInquiryFields } from "@/products/inquiries/server";
import { askBookingServiceSchema, askBookingBindingSchema, type AskBookingBinding, type AskBookingService } from "./ask-service-contracts";
import { listWorkspaceCalendarConnections } from "./calendar/repository";
import { createWorkspaceSchedule, readWorkspaceSchedule } from "./server";
import { scheduleSchema } from "./contracts";
import { publicBookingScheduleSchema } from "./public-booking-contracts";

export const scheduleContentHash = (payload: unknown) => createHash("sha256").update(canonicalJson(payload)).digest("hex");

/** Current native connections only. Never asks a provider about availability. */
export async function readAskBookingBinding(actor: WorkspaceActor, workspaceId: string, service: Pick<AskBookingService, "tenantId" | "inquiryCapabilityId" | "provider" | "timeZone">): Promise<AskBookingBinding> {
  const inspection = await new PostgresOfferingStore().inspect(actor, workspaceId);
  const sites = inspection.websiteBindings.filter(site => site.businessId === workspaceId && site.status === "active" && site.tenantActive && site.actorHasTenantAccess && (!service.tenantId || site.tenantId === service.tenantId));
  if (sites.length !== 1) throw new WorkspaceConflictError("Choose one connected website for the new service. Strelva cannot borrow another website's inquiry connection.");
  const site = sites[0]!;
  const tenant = await readPublicBookingTenant(site.tenantId);
  if (!tenant?.active || !tenant.stableId) throw new WorkspaceConflictError("The service's connected website is unavailable.");
  const inquiry = await readInquiryWorkspace({ tenantId: site.tenantId, businessId: workspaceId });
  const capability = inquiry.snapshot?.state.capabilities.find(item => item.businessId === workspaceId && item.id === service.inquiryCapabilityId);
  const published = capability ? projectPublishedInquiry(capability) : null;
  if (!published || !capability?.live || validateInquiryFields(capability.live, { name: "Booking test", email: "booking-test@example.invalid", message: "Proposed booking test" }).length) throw new WorkspaceConflictError("Select this website's published inquiry form that accepts booking name, email and message. Its required fields must be supported.");
  const calendars = (await listWorkspaceCalendarConnections(actor, workspaceId)).filter(item => item.provider === service.provider && item.status === "connected" && item.timeZone === service.timeZone);
  if (calendars.length !== 1) throw new WorkspaceConflictError("The proposed time zone must match one connected calendar of this business.");
  return { workspaceId, tenantId: site.tenantId, tenantStableId: tenant.stableId, inquiryCapabilityId: published.capabilityId, inquiryVersion: published.version, provider: service.provider, timeZone: service.timeZone, calendarConnectionId: calendars[0]!.id, calendarUpdatedAt: calendars[0]!.updatedAt };
}

export async function prepareAskBookingService(actor: WorkspaceActor, input: { workspaceId: string; possibilityId: string; service: unknown }, deps: {
  enabled(actor: WorkspaceActor, workspaceId: string): Promise<boolean>;
  binding?: typeof readAskBookingBinding;
  create?: (actor: WorkspaceActor, workspaceId: string, raw: { title: string; availability: AskBookingService["availability"] }) => Promise<SavedWork>;
  now?: () => number;
}) {
  // Before any tenant, inquiry, calendar, native Work or provider access.
  if (!await deps.enabled(actor, input.workspaceId)) throw new WorkspaceConflictError("New booking-service preparation is not enabled for this business.");
  const service = askBookingServiceSchema.parse(input.service);
  if (service.availability.some(slot => Date.parse(slot.start) <= (deps.now ?? Date.now)())) throw new WorkspaceConflictError("Propose future times for the service. These are test times until the owner agrees to make it live.");
  const binding = await (deps.binding ?? readAskBookingBinding)(actor, input.workspaceId, service);
  if (binding.workspaceId !== input.workspaceId || binding.provider !== service.provider || binding.timeZone !== service.timeZone || binding.inquiryCapabilityId !== service.inquiryCapabilityId || service.tenantId && binding.tenantId !== service.tenantId) throw new WorkspaceConflictError("The new service's connection belongs to another business or changed.");
  const create = deps.create ?? (async (currentActor, workspaceId, raw) => {
    // Delegated agencies make a business's System through the existing maker
    // path. Owners prepare a draft through ordinary create_work authority.
    if (await boundedStore.makeSystems?.(currentActor, workspaceId) === "agency" && boundedStore.createSystem) {
      const payload = scheduleSchema.parse({ ...initial(raw.title, currentActor), availability: raw.availability, reservations: [] });
      return boundedStore.createSystem(currentActor, workspaceId, { productId: "scheduling", resourceKind: "schedule", title: raw.title, payload });
    }
    return createWorkspaceSchedule(currentActor, workspaceId, raw);
  });
  const work = await create(actor, input.workspaceId, { title: service.serviceName, availability: service.availability });
  const schedule = scheduleSchema.parse(work.payload);
  if (work.workspaceId !== input.workspaceId || work.productId !== "scheduling" || work.resourceKind !== "schedule" || schedule.reservations.length || schedule.pause || canonicalJson(schedule.availability) !== canonicalJson(service.availability)) throw new WorkspaceConflictError("The new schedule could not be verified as the exact isolated service draft.");
  const capabilityId = `ask-${createHash("sha256").update(`${input.workspaceId}:${input.possibilityId}`).digest("hex").slice(0,32)}`;
  const bookingSchedule = publicBookingScheduleSchema.parse({ schemaVersion: 1, capabilityId, version: 1, name: service.serviceName, provider: service.provider, timeZone: service.timeZone, slots: schedule.availability.map((slot, index) => ({ id: `test-slot-${index}`, ...slot })) });
  return { work, service, binding, bookingSchedule, scheduleRevision: schedule.revision, scheduleContentHash: scheduleContentHash(schedule), liveHref: `/book/${encodeURIComponent(binding.tenantId)}/${capabilityId}` };
}

/** A changed schedule, revoked connection or different inquiry version needs a new owner review. */
export async function verifyAskBookingService(actor: WorkspaceActor, workspaceId: string, content: Record<string, unknown>, deps: {
  binding?: typeof readAskBookingBinding; read?: typeof readWorkspaceSchedule;
} = {}) {
  const service = askBookingServiceSchema.parse(content.service);
  const expected = askBookingBindingSchema.parse(content.binding);
  if (expected.workspaceId !== workspaceId) return false;
  const workId = z.string().uuid().parse(content.scheduleWorkId);
  const work = await (deps.read ?? readWorkspaceSchedule)(actor, workId);
  const schedule = scheduleSchema.parse(work.payload);
  if (work.workspaceId !== workspaceId || schedule.revision !== content.scheduleRevision || scheduleContentHash(schedule) !== content.scheduleContentHash || schedule.pause || schedule.reservations.length) return false;
  const current = await (deps.binding ?? readAskBookingBinding)(actor, workspaceId, { ...service, tenantId: expected.tenantId });
  return canonicalJson(current) === canonicalJson(expected);
}
