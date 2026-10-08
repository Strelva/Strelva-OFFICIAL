/**
 * Who gets the "new lead" notification. Reads LEAD_NOTIFY_EMAILS (comma-
 * separated) and DEFAULTS to jacob@strelva.com when it's unset or empty — the
 * whole point of this path is that an unset env can never silence a lead.
 * Exported so the fallback behavior is directly testable.
 */
export function resolveLeadNotifyRecipients(): string[] {
  const parsed = (process.env.LEAD_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ["jacob@strelva.com"];
}

