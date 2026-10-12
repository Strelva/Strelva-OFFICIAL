/**
 * The receipt for a scrubbed copy: row and key counts per tenant, what was left
 * out, and the leak check. It must never contain personal data, so it is built
 * from counts and identifiers only and verified before it is written.
 */
import { createHash } from "node:crypto";
import { PSEUDO_EMAIL_DOMAIN, type ReplacedOriginals } from "./pseudonymize";

export interface TenantCounts {
  slug: string;
  stableId: string | null;
  active: boolean;
  postgresRows: Record<string, number>;
  redisKeys: Record<string, number>;
  redisKeysLeftOut: Record<string, number>;
}

export interface CopyManifest {
  version: 1;
  createdAt: string;
  /** SHA-256 prefixes only: enough to tell two sources apart, not to locate them. */
  source: { postgresHost: string; redisHost: string | null };
  saltFingerprint: string;
  tenantSelection: "active" | "all";
  schema: {
    sourceMigrations: number;
    appliedBeforeLoad: number;
    appliedAfterLoad: string[];
    sourceOnlyMigrations: string[];
  };
  postgres: {
    tables: Record<string, number>;
    tablesAbsentInSource: string[];
    columnsNotLoaded: string[];
    leftOut: string[];
    foreignKeyOrphans: Record<string, number>;
  };
  redis: {
    keys: Record<string, number>;
    keysLeftOut: Record<string, number>;
    keysUnclassified: number;
    keysExpiredBeforeLoad: number;
  } | null;
  tenants: TenantCounts[];
  leakCheck: { passed: boolean; emailsChecked: number; phonesChecked: number; secretsChecked: number; filesChecked: number };
  localOperator: { email: string; note: string };
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_IN_TEXT = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}/;

/**
 * Refuse a manifest that carries an email (other than a scrubbed one), a phone
 * number or any original value the scrub replaced.
 */
export function assertManifestHasNoPersonalData(manifest: unknown, originals?: ReplacedOriginals): void {
  const text = JSON.stringify(manifest);
  for (const match of text.match(EMAIL_IN_TEXT) ?? []) {
    if (!match.toLowerCase().endsWith(`@${PSEUDO_EMAIL_DOMAIN}`)) throw new Error("The manifest contains an email address; refusing to write it.");
  }
  if (PHONE_IN_TEXT.test(text)) throw new Error("The manifest contains a phone number; refusing to write it.");
  if (originals) {
    const lower = text.toLowerCase();
    for (const value of [...originals.emails, ...originals.secrets]) {
      if (value.length >= 6 && lower.includes(value.toLowerCase())) throw new Error("The manifest contains an original value; refusing to write it.");
    }
    const digits = text.replace(/[^0-9]/g, " ");
    for (const phone of originals.phones) {
      const local = phone.length === 11 && phone.startsWith("1") ? phone.slice(1) : phone;
      if (local.length >= 7 && digits.includes(local)) throw new Error("The manifest contains an original phone number; refusing to write it.");
    }
  }
}

export interface LeakFinding {
  file: string;
  kind: "email" | "phone" | "secret";
}

/**
 * Search the copy's files for any original email, phone or secret. Returns
 * findings by file and kind only, never the value.
 */
export function findLeaks(files: Array<{ name: string; text: string }>, originals: ReplacedOriginals): LeakFinding[] {
  const findings: LeakFinding[] = [];
  const emails = [...originals.emails];
  const secrets = [...originals.secrets].filter((value) => value.length >= 8);
  const phones = [...originals.phones].map((key) => (key.length === 11 && key.startsWith("1") ? key.slice(1) : key)).filter((value) => value.length >= 7);
  for (const file of files) {
    const lower = file.text.toLowerCase();
    if (emails.some((email) => lower.includes(email))) findings.push({ file: file.name, kind: "email" });
    if (secrets.some((secret) => file.text.includes(secret))) findings.push({ file: file.name, kind: "secret" });
    const digitRuns = ` ${file.text.replace(/[^0-9]+/g, " ")} `;
    const compact = file.text.replace(/[\s().-]+/g, "");
    if (phones.some((phone) => digitRuns.includes(` ${phone} `) || compact.includes(phone))) findings.push({ file: file.name, kind: "phone" });
  }
  return findings;
}

export function emptyTenantCounts(slug: string, stableId: string | null, active: boolean): TenantCounts {
  return { slug, stableId, active, postgresRows: {}, redisKeys: {}, redisKeysLeftOut: {} };
}

export function increment(record: Record<string, number>, key: string, by = 1): void {
  record[key] = (record[key] ?? 0) + by;
}
