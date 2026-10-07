import { AskPossibilityUnsupportedError, type AskPossibilityInput } from "@/platform/ask/ports";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { prepareAskBookingService } from "@/products/scheduling/server";
import { askReleaseMayBeOn } from "@/platform/ask/release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

export async function askBookingPreparationEnabled(actor: WorkspaceActor, workspaceId: string) {
  return askReleaseMayBeOn() && await systemsReleaseEnabledForWorkspace(workspaceId, { operator: false, tester: false, userId: actor.userId });
}

/** A genuinely new schedule and service. Existing website behavior is kept. */
export async function prepareNewAskBookingService(actor: WorkspaceActor, input: AskPossibilityInput, possibilityId: string, dependencies: { prepare?: typeof prepareAskBookingService; enabled?: typeof askBookingPreparationEnabled } = {}) {
  if (input.candidate?.kind !== "new-booking-service" || !input.introduces) throw new AskPossibilityUnsupportedError("A new service needs an explicit service proposal and new System identity.");
  try {
    const prepared = await (dependencies.prepare ?? prepareAskBookingService)(actor, { workspaceId: input.workspaceId, possibilityId, service: input.candidate }, { enabled: dependencies.enabled ?? askBookingPreparationEnabled });
    const content = { kind: "ask-new-booking-service", scheduleWorkId: prepared.work.id, scheduleRevision: prepared.scheduleRevision, scheduleContentHash: prepared.scheduleContentHash, service: prepared.service, binding: prepared.binding, bookingSchedule: prepared.bookingSchedule, liveHref: prepared.liveHref, contextSystemId: input.systemId, originalWords: input.words?.slice(0,3000) ?? input.intent, askOrigin: input.origin ?? null, askedOnBehalf: input.askedOnBehalf ?? null };
    return {
      content, checks: [{ id: "booking-serves", description: "The exact approved service is published through its owned native schedule, inquiry and connected calendar, and its public entry is enabled." }], previewHref: `/workspace?workspaceId=${encodeURIComponent(input.workspaceId)}&view=systems`,
      effects: [{ id: "publish-booking-service", kind: "publish" as const, channel: "booking_page" as const, system: { introducedKey: input.introduces.key }, description: `Make ${prepared.service.serviceName} available for booking`, request: { businessId: input.workspaceId, tenantId: prepared.binding.tenantId, workId: prepared.work.id, capabilityId: prepared.bookingSchedule.capabilityId, capabilityVersion: prepared.bookingSchedule.version, inquiryCapabilityId: prepared.binding.inquiryCapabilityId, inquiryVersion: prepared.binding.inquiryVersion, provider: prepared.service.provider, displayName: prepared.service.serviceName, timeZone: prepared.service.timeZone, askService: { proposal: prepared.service, expectedSchedule: prepared.work.payload, calendarConnectionId: prepared.binding.calendarConnectionId, calendarUpdatedAt: prepared.binding.calendarUpdatedAt } }, after: [] }],
    };
  } catch (error) {
    if (error instanceof WorkspaceConflictError) throw new AskPossibilityUnsupportedError(error.message);
    throw error;
  }
}
