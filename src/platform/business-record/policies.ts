import { policyValueSchemas, POLICY_KEYS, type BusinessRecord, type PolicyKey, type PolicyValues } from "./contracts";

export type BusinessPolicy<K extends PolicyKey> = {
  value: PolicyValues[K]; source: NonNullable<BusinessRecord["facts"][PolicyKey]>["source"];
  verified: boolean; updatedAt: string; updatedBy: string;
};
export type PolicyFacts = { [K in PolicyKey]?: BusinessPolicy<K> };
export interface BusinessPolicies {
  workspaceId: string; revision: number; confirmed: PolicyFacts; unconfirmed: PolicyFacts;
}

/** Use an already-authorized record. Keep uncertain facts separate: absence is
 * unknown, never "no deposit", "no waiver" or "walk-ins accepted". */
export function selectBusinessPolicies(record: Pick<BusinessRecord, "workspaceId" | "revision" | "facts">): BusinessPolicies {
  const confirmed: PolicyFacts = {};
  const unconfirmed: PolicyFacts = {};
  for (const key of POLICY_KEYS) {
    const entry = record.facts[key];
    if (!entry) continue;
    const value = policyValueSchemas[key].parse(entry.value);
    const target = entry.verified && (entry.source === "owner" || entry.source === "operator") ? confirmed : unconfirmed;
    Object.assign(target, { [key]: { ...entry, value } });
  }
  return { workspaceId: record.workspaceId, revision: record.revision, confirmed, unconfirmed };
}

export type PublishedPolicies = { [K in PolicyKey]?: { value: PolicyValues[K]; source: "owner" | "operator"; updatedAt: string } };

/** For get_policies, JSON-LD and llms.txt after the caller checks publication
 * consent. Excludes unconfirmed terms and private actor/workspace identifiers. */
export function selectPublishedBusinessPolicies(record: Pick<BusinessRecord, "workspaceId" | "revision" | "facts">): PublishedPolicies {
  const { confirmed } = selectBusinessPolicies(record);
  const result: PublishedPolicies = {};
  for (const key of POLICY_KEYS) {
    const entry = confirmed[key];
    if (entry) Object.assign(result, { [key]: { value: entry.value, source: entry.source, updatedAt: entry.updatedAt } });
  }
  return result;
}
