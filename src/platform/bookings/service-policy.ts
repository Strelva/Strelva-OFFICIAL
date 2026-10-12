/** Booking-only rules keyed to the shared record. Names, prices and lengths
 * remain on business_services; every use still reads active record facts. */
import { z } from "zod";
import type { BookingContext } from "./store";
import { settingsOrDefault } from "./availability";
import { bookingServicePoliciesEnabled, type BookingServicePolicy } from "./service-policy-schema";
export * from "./service-policy-schema";

export function servicePolicy(context: BookingContext, serviceId: string): BookingServicePolicy {
  const record = context.services.find(service => service.id === serviceId || service.externalRef === serviceId);
  const defaults = settingsOrDefault(context);
  return context.servicePolicies?.find(policy => policy.businessServiceId === record?.id) ?? {
    businessServiceId: record?.id ?? serviceId, mode: context.workspaceId && !context.settings && bookingServicePoliciesEnabled() ? "request" : defaults.mode,
    bufferMinutes: defaults.bufferMinutes, bookable: true, intake: [],
  };
}
export function contextForService(context: BookingContext, serviceId: string): BookingContext {
  const policy = servicePolicy(context, serviceId);
  const settings = settingsOrDefault(context);
  return { ...context, settings: { ...settings, mode: policy.mode, bufferMinutes: policy.bufferMinutes,
    ...(context.workspaceId && !context.settings && bookingServicePoliciesEnabled() ? { defaultLengthMinutes: 30, minNoticeMinutes: 240, maxAdvanceDays: 60 } : {}) } };
}
export function validateBookingIntake(policy: BookingServicePolicy, raw: unknown): Record<string, string> {
  const answers = z.record(z.string().max(80), z.string().max(2000)).parse(raw ?? {});
  for (const question of policy.intake) if (question.required && !answers[question.id]?.trim()) throw new Error(`Please answer: ${question.label}`);
  if (Object.keys(answers).some(id => !policy.intake.some(question => question.id === id) && id !== "notes" && id !== "message")) throw new Error("This intake question is unavailable.");
  return answers;
}
