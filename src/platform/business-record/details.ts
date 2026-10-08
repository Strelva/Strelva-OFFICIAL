import { factValueSchemas, type BusinessRecord, type BusinessRecordWriteSource } from "./contracts";

/**
 * Business details, the business-menu home of `/dashboard/settings`
 * (owner-entry spec §5): the few business record facts an owner edits by
 * hand, plus who gets Strelva's email (the owner recipient). Pure; the page's
 * server action writes through patchBusinessRecord, and the SQL decides.
 */

export const EDITABLE_DETAILS = ["display_name", "phone", "email", "address", "description", "owner_recipient"] as const;
export type EditableDetail = (typeof EDITABLE_DETAILS)[number];

export const DETAIL_LABELS: Record<EditableDetail, string> = {
  display_name: "Business name",
  phone: "Phone",
  email: "Public email",
  address: "Address",
  description: "Description",
  owner_recipient: "Send Strelva's emails to",
};

/** The form value of one fact, as text. */
export function detailText(record: BusinessRecord, key: EditableDetail): string {
  const value = record.facts[key]?.value;
  if (key === "owner_recipient") return value && typeof value === "object" && "email" in value && typeof value.email === "string" ? value.email : "";
  if (key === "address") {
    const address = factValueSchemas.address.safeParse(value);
    return address.success ? address.data.formatted ?? [address.data.line1, address.data.line2, address.data.city, address.data.region, address.data.postalCode, address.data.country].filter(Boolean).join(", ") : "";
  }
  return typeof value === "string" ? value : "";
}

export type DetailsPatchResult =
  | { kind: "patch"; facts: Record<string, { value: unknown } | null> }
  | { kind: "unchanged" }
  | { kind: "invalid"; field: EditableDetail; message: string };

/**
 * Only changed fields are written. Clearing a field removes the fact, except
 * the owner recipient, which can't be cleared here (the business would lose
 * its report and alert emails). Clearing the formatted address keeps any
 * independently recorded structured address with a first line.
 */
export function businessDetailsPatch(record: BusinessRecord, form: Partial<Record<EditableDetail, string>>): DetailsPatchResult {
  const facts: Record<string, { value: unknown } | null> = {};
  for (const key of EDITABLE_DETAILS) {
    const raw = form[key];
    if (raw === undefined) continue;
    const next = key === "email" || key === "owner_recipient" ? raw.trim().toLowerCase() : raw.trim();
    if (next === detailText(record, key)) continue;
    if (!next) {
      if (key === "owner_recipient") return { kind: "invalid", field: key, message: "Strelva needs an address to send your reports and alerts to." };
      if (key === "address") {
        const prior = factValueSchemas.address.safeParse(record.facts.address?.value);
        if (prior.success && prior.data.line1) {
          if (prior.data.formatted === undefined) continue;
          const structured = { ...prior.data };
          delete structured.formatted;
          facts.address = { value: structured };
          continue;
        }
      }
      if (record.facts[key]) facts[key] = null;
      continue;
    }
    const prior = record.facts.owner_recipient?.value;
    const value = key === "owner_recipient"
      ? { email: next, ...(prior && typeof prior === "object" && "name" in prior && typeof prior.name === "string" ? { name: prior.name } : {}) }
      : key === "address"
        ? { ...factValueSchemas.address.safeParse(record.facts.address?.value).data, formatted: next }
        : next;
    const parsed = factValueSchemas[key].safeParse(value);
    if (!parsed.success) return { kind: "invalid", field: key, message: key === "phone" ? "Use a phone number with 7 to 15 digits." : key === "address" ? "Use an address of 200 characters or fewer." : key.includes("email") || key === "owner_recipient" ? "Use a full email address." : "That value isn't allowed." };
    facts[key] = { value: parsed.data };
  }
  return Object.keys(facts).length ? { kind: "patch", facts } : { kind: "unchanged" };
}

/** Who may edit here, and as what source. Members and agencies read only. */
export function detailsWriteSource(access: BusinessRecord["access"], operator: boolean): BusinessRecordWriteSource | null {
  if (access === "owner") return "owner";
  if (access === "admin" && operator) return "operator";
  return null;
}
