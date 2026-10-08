import { InquiryEngine } from "@/products/inquiries";
import { REHEARSAL_CHECK_IDS } from "@/products/inquiries/contracts";
import { scheduleSchema } from "./contracts";
import { publicBookingScheduleSchema } from "./public-booking-contracts";

import { askServiceSetupSelectionSchema, askServiceSetupIds, type AskServiceSetupSelection } from "@/platform/ask/new-service";
export * from "@/platform/ask/new-service";

/** Real native form/record engine; no email consent, routing, follow-up or outside call. */
export function composeAskServiceInquiry(selection: AskServiceSetupSelection, actorId: string) {
  const ids = askServiceSetupIds(selection);
  let sequence = 0;
  const engine = new InquiryEngine({ businessId: selection.workspaceId, now: () => selection.at,
    idFactory: prefix => prefix === "capability" ? ids.inquiryId : `ask-${selection.setupId}-${prefix}-${++sequence}` });
  const work = engine.start({ actorId, intent: "Collect customer requests", title: selection.service.serviceName,
    requestId: `ask-${selection.setupId}-request`, emailConnection: { status: "missing", consent: "missing", lastCheckedAt: null } });
  engine.acceptShape(work.id, { actorId, selectedLineIds: ["form", "record"] });
  const rehearsal = engine.runRehearsal(work.id);
  if (!rehearsal.passed || !rehearsal.externalWritesBlocked || !rehearsal.nothingLive || rehearsal.outboundMessages.length
    || REHEARSAL_CHECK_IDS.some(id => !rehearsal.checks.some(check => check.id === id && check.status === "passed"))) throw new Error("The new inquiry setup failed its native rehearsal.");
  return { engine, work: engine.getWork(work.id), rehearsal };
}

/** Calculated acceptance, never a write. The scoped SQL transaction commits it. */
export async function compiledAskServiceSetup(raw: unknown, actorId: string, activationAt=new Date().toISOString()) {
  const selection = askServiceSetupSelectionSchema.parse(raw);
  const ids = askServiceSetupIds(selection);
  const prepared = composeAskServiceInquiry(selection, actorId);
  const engine = new InquiryEngine({ businessId: selection.workspaceId, state: prepared.engine.snapshot(), now: () => activationAt,
    idFactory: prefix => `ask-${selection.setupId}-${prefix}-accepted`,
    livePublisher: { async publish() { return { status: "accepted", acceptanceId: `ask-service-setup:${selection.setupId}`, acceptedAt: activationAt, providerReceipt: { target: "native Postgres setup" } }; } } });
  engine.approvePublish(prepared.work.id, { actorId, version: 1 });
  const published = await engine.publish(prepared.work.id, { actorId, version: 1, explicit: true });
  if (published.provider.status !== "accepted") throw new Error("The native inquiry setup could not be calculated.");
  const schedule = scheduleSchema.parse({ version: 1, revision: 0, title: selection.service.serviceName, createdBy: actorId,
    createdAt: selection.at, history: [], availability: selection.service.availability, reservations: [] });
  return { selection, ...ids, inquiryState: engine.snapshot(), schedule };
}
export function askServiceSetupTry(raw: unknown) {
  const selection = askServiceSetupSelectionSchema.parse(raw);
  const ids = askServiceSetupIds(selection);
  return publicBookingScheduleSchema.parse({ schemaVersion: 1, capabilityId: ids.capabilityId, version: 1,
    name: selection.service.serviceName, provider: selection.service.provider, timeZone: selection.service.timeZone,
    slots: selection.service.availability.map((slot, index) => ({ id: `test-slot-${index}`, ...slot })) });
}
/** Public-only projection of the same native Inquiry definition used at activation. */
export function askServiceInquiryTry(raw: unknown, actorId: string) {
  const selection=askServiceSetupSelectionSchema.parse(raw);
  const {work}=composeAskServiceInquiry(selection,actorId);
  const draft=work.draft!;
  return {schemaVersion:1 as const,capabilityId:draft.id,version:draft.version,name:draft.name,
    form:{component:draft.form.component,id:draft.form.id,title:draft.form.title,intro:draft.form.intro,disclosure:draft.form.disclosure,
      fields:draft.form.fields.map(({id,label,kind,component,required,placeholder,options})=>({id,label,kind,component,required,...(placeholder?{placeholder}:{}),...(options?{options}: {})}))}};
}
