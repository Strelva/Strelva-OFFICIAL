/**
 * Optional lead attribution on `/api/v1/leads/[tenant]` (additive): the page
 * the form was on, the referrer and utm_* tags, for the outcome loop. Stored
 * in the lead's fields. Absent for every client form sent today; the
 * custom-repo starter sends it first and client repos adopt it on their next
 * change.
 */
export const LEAD_ATTRIBUTION_KEYS = ["page", "referrer", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export function readLeadAttribution(body: Record<string, unknown>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const key of LEAD_ATTRIBUTION_KEYS) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim().slice(0, key === "page" || key === "referrer" ? 500 : 200);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}
