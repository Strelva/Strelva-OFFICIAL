import { z } from "zod";
import { canonicalJson, sha256, uuidFromSeed } from "@/platform/business-record/tenant-import";

const interval = z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict();
export const askNewServiceSchema = z.object({
  kind: z.literal("new-booking-service"), tenantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  serviceName: z.string().trim().min(1).max(120), durationMinutes: z.number().int().min(5).max(480),
  provider: z.enum(["google", "outlook"]),
  timeZone: z.string().trim().min(1).max(128).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Use an IANA time zone."),
  availability: z.array(interval).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  try { new Intl.DateTimeFormat("en",{timeZone:value.timeZone}); } catch { return; }
  const offset = (ms:number) => new Intl.DateTimeFormat("en",{timeZone:value.timeZone,timeZoneName:"longOffset"}).formatToParts(new Date(ms)).find(part=>part.type==="timeZoneName")?.value;
  const localDates = new Set<string>();
  const local = (date: string) => new Intl.DateTimeFormat("en-CA", {timeZone:value.timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(date));
  for (const [index, slot] of value.availability.entries()) {
    const start = Date.parse(slot.start);
    if(!Number.isFinite(start) || !Number.isFinite(Date.parse(slot.end)))continue;
    if ([start-86400000,Date.parse(slot.end),start+86400000].some(ms=>offset(ms)!==offset(start))) ctx.addIssue({code:"custom",path:["availability",index],message:"Choose a configured time away from a daylight-saving or time-zone offset change."});
    const day = local(slot.start);
    if (localDates.has(day) || local(slot.end) !== day || Date.parse(slot.start) % 60000 || Date.parse(slot.end) % 60000) ctx.addIssue({code:"custom",path:["availability",index],message:"Provide one whole-minute configured time per local date, ending on that date."});
    localDates.add(day);
    if (Date.parse(slot.end) - Date.parse(slot.start) !== value.durationMinutes * 60_000) ctx.addIssue({ code: "custom", path: ["availability", index], message: "Each time must match the service duration." });
    if (value.availability.some((other, prior) => prior < index && Date.parse(other.start) < Date.parse(slot.end) && Date.parse(other.end) > Date.parse(slot.start))) ctx.addIssue({ code: "custom", path: ["availability", index], message: "Times must not overlap." });
  }
});
export type AskNewService = z.infer<typeof askNewServiceSchema>;
export const askServiceSetupSelectionSchema = z.object({
  kind: z.literal("ask-new-service-setup"), workspaceId: z.string().uuid(), setupId: z.string().uuid(),
  tenantStableId: z.string().uuid(), calendarConnectionId: z.string().uuid(), calendarUpdatedAt: z.string().datetime({ offset: true }),
  inquiryRevision: z.number().int().positive().nullable(), inquiryStateHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  businessRecordRevision: z.number().int().nonnegative(), recordHours: z.object({ timezone: z.string(), weekly: z.array(z.object({day:z.number().int(),opens:z.string(),closes:z.string()})), overrides: z.array(z.object({date:z.string(),closed:z.boolean(),opens:z.string().optional(),closes:z.string().optional(),label:z.string().optional()})).optional() }).nullable(),
  at: z.string().datetime(), service: askNewServiceSchema,
}).strict();
export type AskServiceSetupSelection = z.infer<typeof askServiceSetupSelectionSchema>;
export const setupHash = (value: unknown) => sha256(canonicalJson(value));
export function askServiceSetupIds(selection: AskServiceSetupSelection) {
  const suffix = setupHash({ businessId: selection.workspaceId, setupId: selection.setupId }).slice(0, 32);
  return { workId: uuidFromSeed(`ask-service:${selection.workspaceId}:${selection.setupId}`), capabilityId: `ask-service-${suffix}`, inquiryId: `ask-inquiry-${suffix}` };
}
