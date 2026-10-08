import { AskPossibilityUnsupportedError, type AskPossibilityInput } from "@/platform/ask/ports";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { inquiryReleaseMayBeOn, inquiryReleaseEnabledForWorkspace } from "@/products/inquiries/server";
import { makeRealChannelEnabled } from "@/platform/make-real/live-server";
import { askNewServiceSchema, askServiceSetupSelectionSchema, askServiceSetupIds, askServiceSetupTry, composeAskServiceInquiry, setupHash } from "@/products/scheduling/server";
import { inspectAskServiceSetup } from "@/products/scheduling/server";

export async function prepareAskServiceSetup(actor: WorkspaceActor, input: AskPossibilityInput, id: string, deps: {
  enabled?: (workspaceId: string) => Promise<boolean>; inspect?: typeof inspectAskServiceSetup; now?: () => string;
} = {}) {
  const enabled = deps.enabled ?? (async workspaceId => inquiryReleaseMayBeOn()
    && await inquiryReleaseEnabledForWorkspace(workspaceId, { userId: actor.userId, operator: false, tester: false })
    && await makeRealChannelEnabled(workspaceId, "booking_page"));
  if (!await enabled(input.workspaceId)) throw new AskPossibilityUnsupportedError("New service setup is not enabled for this business.");
  if (input.candidate?.kind !== "new-booking-service" || !input.introduces) throw new AskPossibilityUnsupportedError("A new service needs its own System and explicit duration, future times, provider and time zone.");
  const service = askNewServiceSchema.parse(input.candidate);
  const at = (deps.now ?? (() => new Date().toISOString()))();
  if (service.availability.some(slot => Date.parse(slot.start) <= Date.parse(at)+4*3600000 || Date.parse(slot.end)>Date.parse(at)+60*86400000)) throw new AskPossibilityUnsupportedError("Provide configured times with at least four hours of notice and within sixty days.");
  const current = await (deps.inspect ?? inspectAskServiceSetup)(actor, input.workspaceId, service);
  if (current.recordHours) {
    const format = (date:string) => new Intl.DateTimeFormat("en-CA",{timeZone:service.timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(date));
    const time = (date:string) => new Intl.DateTimeFormat("en-GB",{timeZone:service.timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(date));
    if (service.availability.some(slot => current.recordHours!.overrides?.some(day=>day.date===format(slot.start)) || !current.recordHours!.weekly.some(day=>day.day===new Date(`${format(slot.start)}T12:00:00Z`).getUTCDay() && day.opens<=time(slot.start) && day.closes>=time(slot.end)))) throw new AskPossibilityUnsupportedError("Choose times within the current confirmed weekly hours, without a date override.");
  }
  const selection = askServiceSetupSelectionSchema.parse({ kind: "ask-new-service-setup", workspaceId: input.workspaceId, setupId: id,
    tenantStableId: current.tenantStableId, calendarConnectionId: current.calendar.id, calendarUpdatedAt: current.calendar.updatedAt,
    businessRecordRevision: current.businessRecordRevision, recordHours: current.recordHours, inquiryRevision: current.snapshot?.revision ?? null, inquiryStateHash: current.snapshot ? setupHash(current.snapshot.state) : null, at, service });
  const ids = askServiceSetupIds(selection);
  const prepared = composeAskServiceInquiry(selection, actor.userId);
  const bookingPath = `/book/${service.tenantId}/${ids.capabilityId}`;
  return { content: { kind: "ask-new-service-setup", selection, ...ids, bookingSchedule: askServiceSetupTry(selection), rehearsal: prepared.rehearsal,
    originalWords: input.words?.slice(0, 3000) ?? input.intent, askOrigin: input.origin ?? null, askedOnBehalf: input.askedOnBehalf ?? null },
    previewHref: bookingPath, checks: [{ id: "native-service-setup-saved", description: "The saved service duration, configured times and Inquiry definition match the owner's reviewed alternative." }],
    effects: [{ id: "publish-native-service", kind: "publish" as const, channel: "booking_page" as const, system: { introducedKey: input.introduces.key },
      description: `Set up ${service.serviceName} with its native inquiry`, request: { businessId: input.workspaceId, tenantId: service.tenantId, workId: ids.workId,
        capabilityId: ids.capabilityId, capabilityVersion: 1, inquiryCapabilityId: ids.inquiryId, inquiryVersion: 1, provider: service.provider,
        displayName: service.serviceName, timeZone: service.timeZone, setupAlternative: selection }, after: [] }] };
}
