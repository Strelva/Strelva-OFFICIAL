import { z } from "zod";
import type { ConfirmedBusinessFacts } from "@/platform/business-record/contracts";

/** Native site IDs are never inferred from an externalRef, service name or
 * array position. Each binding names one business UUID and one native ID. */
export const nativeFactFields = ["display_name", "phone", "email", "address", "hours"] as const;
export const nativeServiceFields = ["name", "description", "priceText", "durationMinutes"] as const;
export const nativeFactMappingInputSchema = z.object({
  fields: z.array(z.enum(nativeFactFields)).max(5).refine(values => new Set(values).size === values.length, "Duplicate fact field"),
  services: z.array(z.object({
    serviceId: z.string().uuid().transform(value => value.toLowerCase()), nativeServiceId: z.string().trim().min(1).max(200),
    fields: z.array(z.enum(nativeServiceFields)).min(1).max(4).refine(values => new Set(values).size === values.length, "Duplicate service field"),
  }).strict()).max(200),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.services.map(row => row.serviceId)).size !== value.services.length || new Set(value.services.map(row => row.nativeServiceId)).size !== value.services.length) {
    ctx.addIssue({ code: "custom", message: "A service mapping must be unambiguous" });
  }
});
export type NativeFactMappingInput = z.infer<typeof nativeFactMappingInputSchema>;
export const nativeFactMappingSchema = nativeFactMappingInputSchema.safeExtend({ revision: z.number().int().nonnegative() });
export type NativeFactMapping = z.infer<typeof nativeFactMappingSchema>;
export const nativeMappedFactsSchema = z.object({
  mapping: nativeFactMappingSchema,
  recordRevision: z.number().int().nonnegative(),
  services: z.array(z.object({ id: z.string().uuid(), name: z.string(), description: z.string().nullable(), priceText: z.string().nullable(), durationMinutes: z.number().int().nullable(), active: z.boolean() }).strict()).max(200),
}).strict();
export type NativeMappedFacts = z.infer<typeof nativeMappedFactsSchema>;
export type NativeFactSection = "contact" | "settings" | "services";
/** Preserves the established reviewed contact projection for linked native
 * sites. Name and services are opt-in, field-specific mappings. */
export const defaultNativeFactMapping = (): NativeFactMapping => ({ revision: 0, fields: ["phone", "email", "address", "hours"], services: [] });

/** Record writes identify changed services by UUID. An added service with no
 * ID cannot already have a site mapping, so it does not refresh other rows. */
export function nativeChangedKeys(patch: { facts?: Record<string, unknown>; services?: Array<{ id?: unknown }> }): string[] {
  return [...Object.keys(patch.facts ?? {}), ...new Set((patch.services ?? []).flatMap(service => typeof service.id === "string" ? [`service:${service.id.toLowerCase()}`] : []))];
}

export function nativeMappingSections(mapping: NativeFactMapping, changed: readonly string[]): NativeFactSection[] {
  return [
    ...(mapping.fields.some(field => field !== "display_name" && changed.includes(field)) ? ["contact" as const] : []),
    ...(mapping.fields.includes("display_name") && changed.includes("display_name") ? ["settings" as const] : []),
    ...(mapping.services.some(binding => changed.includes(`service:${binding.serviceId}`)) ? ["services" as const] : []),
  ];
}

/** Project only the selected fields. Missing/deleted/unconfirmed services or
 * duplicate/missing native IDs are a held review, never a guessed match. */
export function nativeMappedSection(section: "settings" | "services", confirmed: ConfirmedBusinessFacts, mapped: NativeMappedFacts,
  current: Record<string, unknown>): { data: Record<string, unknown>; held: boolean } {
  if (section === "settings") {
    const name = confirmed.facts.display_name;
    return typeof name === "string" && name.trim() && name.length <= 160
      ? { data: { ...current, siteName: name }, held: false }
      : { data: current, held: true };
  }
  if (!Array.isArray(current.services)) return { data: current, held: true };
  const rows = current.services as Array<Record<string, unknown>>;
  const updates = new Map<string, Record<string, unknown>>();
  for (const binding of mapped.mapping.services) {
    const originals = rows.filter(row => row.id === binding.nativeServiceId);
    const source = mapped.services.find(service => service.id === binding.serviceId);
    if (originals.length !== 1 || !source?.active) return { data: current, held: true };
    const next = { ...originals[0] };
    for (const field of binding.fields) {
      const value = source[field];
      // A removal is never translated into destroying approved site content.
      if (value === null) return { data: current, held: true };
      if (field === "priceText") next.price = value;
      else if (field === "durationMinutes") next.duration = `${value} minutes`;
      else next[field] = value;
    }
    updates.set(binding.nativeServiceId, next);
  }
  return { data: { ...current, services: rows.map(row => updates.get(String(row.id)) ?? row) }, held: false };
}
