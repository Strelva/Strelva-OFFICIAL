import { z } from "zod";
import { inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { factValueSchemas } from "@/platform/business-record/contracts";
import type { InquiryCapabilityDefinition } from "./contracts";

const contextSchema = z.object({
  workspaceId: z.string().uuid(),
  facts: z.record(z.string(), z.object({ value: z.unknown(), verified: z.boolean() })),
  people: z.array(z.object({ id: z.string().uuid(), name: z.string(), email: z.string().nullable(), active: z.boolean() })),
  services: z.array(z.object({ id: z.string().uuid(), name: z.string(), description: z.string().nullable(), priceText: z.string().nullable(), active: z.boolean(), verified: z.boolean() })),
});
export type InquiryBusinessContext = z.infer<typeof contextSchema>;

/** Service choices come from the current confirmed record. The stored release
 * identifies a service selector; it never keeps a second list of services. */
export function applyInquiryBusinessServices<T extends Pick<InquiryCapabilityDefinition["form"], "fields">>(form: T, context: InquiryBusinessContext): T {
  const options = context.services.filter(service => service.active && service.verified).map(service => service.name);
  return { ...form, fields: form.fields.map(field => field.kind === "select" && ["service", "service_id", "serviceId"].includes(field.id)
    ? { ...field, options } : field) };
}

export async function inquiryDefinitionAtUse(tenantId: string, definition: InquiryCapabilityDefinition): Promise<InquiryCapabilityDefinition> {
  const context = await readInquiryBusinessContext(tenantId);
  return context ? { ...definition, form: applyInquiryBusinessServices(definition.form, context) } : definition;
}

export function inquiryBusinessFactsEnabled(): boolean {
  return process.env.STRELVA_INQUIRY_BUSINESS_FACTS === "1";
}

/** Trusted tenant routing selects the business; this server-only read exposes
 * no contacts and confers no permission to send, promise, or publish. */
export async function readInquiryBusinessContext(tenantId: string, read = inquiryRecordsRpc): Promise<InquiryBusinessContext | null> {
  if (!inquiryBusinessFactsEnabled()) return null;
  const data = await read("read_inquiry_business_context", { p_tenant_id: tenantId });
  return data === null ? null : contextSchema.parse(data);
}

/** Removed staff always routes to the owner. Destinations may retain a legacy
 * name/email while being adapted, but only a current business person can win. */
export function inquiryPersonEmail(context: InquiryBusinessContext, destination?: string | null): string | null {
  if (!destination) return null;
  const key = destination.replace(/^person:/, "").trim().toLowerCase();
  const person = context.people.find(person => person.id === key || person.email?.toLowerCase() === key || person.name.toLowerCase() === key);
  return person?.active && person.email ? person.email : null;
}

/** Business hours, read immediately before acting, include dated closures.
 * Missing/unconfirmed hours fail closed for a converted business. */
export function inquiryWithinBusinessHours(context: InquiryBusinessContext, now: Date): boolean {
  const fact = context.facts.hours;
  const parsed = factValueSchemas.hours.safeParse(fact?.value);
  if (!fact?.verified || !parsed.success) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: parsed.data.timezone, year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const part = (type: string) => parts.find(part => part.type === type)?.value ?? "";
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const time = `${part("hour")}:${part("minute")}`;
    const override = parsed.data.overrides?.find(item => item.date === date);
    if (override) return !override.closed && Boolean(override.opens && override.closes && time >= override.opens && time < override.closes);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
    return parsed.data.weekly.some(item => item.day === day && time >= item.opens && time < item.closes);
  } catch { return false; }
}
