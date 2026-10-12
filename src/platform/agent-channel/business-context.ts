import { businessRecordSchema, parseFactValue } from "@/platform/business-record/contracts";

/** The assistant's business profile is narrower than the owner's record.
 * New record fields never become assistant-readable by default. */
const FACTS = [
  "legal_name", "display_name", "phone", "email", "address",
  "service_area", "hours", "links", "description",
] as const;

export function assistantBusinessContext(raw: unknown) {
  const record = businessRecordSchema.parse(raw);
  const facts = Object.fromEntries(FACTS.flatMap(key => {
    const entry = record.facts[key];
    return entry ? [[key, {
      value: parseFactValue(key, entry.value),
      source: entry.source, verified: entry.verified, updatedAt: entry.updatedAt,
    }]] : [];
  }));
  return {
    workspaceId: record.workspaceId, revision: record.revision, updatedAt: record.updatedAt,
    facts,
    services: record.services.map(service => ({
      id: service.id, name: service.name, description: service.description,
      durationMinutes: service.durationMinutes, priceText: service.priceText,
      active: service.active, verified: service.verified, updatedAt: service.updatedAt,
    })),
  };
}
