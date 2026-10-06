/**
 * What the scrubbed production copy contains, and how each value is scrubbed.
 *
 * Fail closed: a source column with no rule here stops the run, and a Redis key
 * outside an included family is counted but never read. Pure: no I/O.
 */
import { authoritativePatterns } from "../../src/lib/tenant-rename";
import { NEUTRAL_URL, Pseudonymizer, SECRET_PLACEHOLDER, isEmailLike } from "./pseudonymize";

// ---------------------------------------------------------------------------
// JSON values
// ---------------------------------------------------------------------------

/**
 * public: published website content and configuration. Emails, phones and
 * credentials are replaced; people inside testimonial/review lists are renamed;
 * the rest is the client's public copy and stays.
 * personal: records about real people (leads, events, rewards, accounts).
 * Names, free text and URLs are replaced; only structural tokens stay.
 */
export type JsonMode = "public" | "personal";

function snake(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
}

const SECRET_KEY = /(^|_)(token|tokens|secret|secrets|password|passwd|pwd|api_key|apikey|private_key|client_secret|access_token|refresh_token|id_token|webhook|webhook_url|signing_key|signing_secret|credential|credentials|authorization|cookie|session_token|dsn)($|_)/;
const SECRET_KEY_EXEMPT = /(^|_)design_tokens$/;
const EMAIL_KEY = /(^|_)e?_?mails?$/;
const PHONE_KEY = /(^|_)(phone|phones|tel|telephone|mobile|cell|fax|sms|whatsapp|phone_number|mobile_number|cell_number|telephone_number)$/;
const NAME_KEY = /(^|_)(name|names|first_name|last_name|full_name|display_name|given_name|family_name|author|reviewer|reviewer_name|contact|customer|client|nickname|signature)$/;
const NOT_A_PERSON_NAME = /(^|_)(service|site|business|product|item|file|tenant|location|section|page|capability|plan|template|provider|domain|host|event|calendar|field|tool|app|model|workspace|account|company|brand|org|organization|category|collection|tag|tier|badge|form|source|reward|fruit)_name$/;
const TEXT_KEY = /(^|_)(message|messages|body|text|comment|comments|note|notes|reply|review|review_text|content|description|reason|title|subject|summary|details|detail|address|street|address_line\d?|city|postal_code|zip|zip_code|ip|ip_address|user_agent|question|answer|quote|feedback|request|transcript|prompt|response|draft)$/;
const BIRTHDAY_KEY = /(^|_)(birthday|birth_date|dob|date_of_birth)$/;
const PEOPLE_CONTAINER = /^(testimonials|reviews|reviewers|customers|clients|leads|bookings|members|subscribers|guests|attendees|contacts)$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMERIC = /^-?\d+(?:\.\d+)?$/;
const SLUG = /^[a-z0-9][a-z0-9_.:/-]{0,80}$/;
const DIGIT_ID = /^(?=.*\d)[A-Za-z0-9_:.-]{6,128}$/;

/** True for values that carry no personal meaning: ids, timestamps, enums. */
export function isStructuralToken(value: string): boolean {
  if (value === "" || value === SECRET_PLACEHOLDER) return true;
  return UUID.test(value) || ISO_DATE.test(value) || NUMERIC.test(value) || SLUG.test(value) || DIGIT_ID.test(value);
}

function personalUrl(p: Pseudonymizer, value: string): string {
  return /^https?:\/\//i.test(value) ? `https://${"scrubbed.strelva.test"}/${p.digest("url", value).slice(0, 12)}` : value;
}

function scrubKeyedString(p: Pseudonymizer, key: string, value: string, mode: JsonMode, inPeople: boolean): string {
  const k = snake(key);
  if (SECRET_KEY.test(k) && !SECRET_KEY_EXEMPT.test(k)) return p.secret(value);
  if (EMAIL_KEY.test(k) || isEmailLike(value)) return p.email(value);
  if (PHONE_KEY.test(k)) return p.phone(value);
  const personal = mode === "personal" || inPeople;
  if (personal && BIRTHDAY_KEY.test(k)) return p.birthday(value);
  if (personal && NAME_KEY.test(k) && !NOT_A_PERSON_NAME.test(k)) return p.name(value);
  if (mode === "personal") {
    if (TEXT_KEY.test(k)) return p.text(value);
    const scrubbed = p.scrubString(value);
    if (/^https?:\/\//i.test(scrubbed)) return personalUrl(p, scrubbed);
    return isStructuralToken(scrubbed) ? scrubbed : p.text(scrubbed);
  }
  return p.scrubString(value);
}

/** Deep scrub of a JSON value. Object key order and non-string values are preserved. */
export function scrubJson(p: Pseudonymizer, value: unknown, mode: JsonMode, key = "", inPeople = false): unknown {
  if (typeof value === "string") return scrubKeyedString(p, key, value, mode, inPeople);
  if (Array.isArray(value)) return value.map((item) => scrubJson(p, item, mode, key, inPeople));
  if (value && typeof value === "object") {
    const people = inPeople || PEOPLE_CONTAINER.test(snake(key));
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      scrubJson(p, child, mode, childKey, people),
    ]));
  }
  return value;
}

/**
 * Structured inquiry fields: the field id says what the value is. Unknown
 * fields keep only enum-like answers ("yes", "weekday"); everything else is filler.
 */
export function scrubLeadFields(p: Pseudonymizer, fields: unknown): unknown {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return scrubJson(p, fields, "personal");
  return Object.fromEntries(Object.entries(fields as Record<string, unknown>).map(([key, value]) => {
    if (typeof value !== "string") return [key, scrubJson(p, value, "personal", key)];
    const k = key.toLowerCase();
    if (k.includes("email") || isEmailLike(value)) return [key, p.email(value)];
    if (/phone|tel|mobile|cell|sms/.test(k)) return [key, p.phone(value)];
    if (k.includes("name")) return [key, p.name(value)];
    const scrubbed = p.scrubString(value);
    return [key, /^[a-z0-9][a-z0-9 _-]{0,23}$/.test(scrubbed) || NUMERIC.test(scrubbed) ? scrubbed : p.text(scrubbed)];
  }));
}

// ---------------------------------------------------------------------------
// Postgres tables
// ---------------------------------------------------------------------------

export type ColumnRule =
  | "keep" // structural or public business data; still passes the credential/email/phone/Stripe string scrub
  | "email" | "phone" | "name" | "text" | "secret" | "stripe" | "neutral_url"
  | "public_json" | "personal_json" | "lead_fields"
  | "owner_name" // a person, unless it is the business name repeated (the planner checks that)
  | "workspace_name" // personal workspaces are named after a person; business ones are kept
  | "external_user_id"
  | "lead_hash" // recomputed from the scrubbed lead so capture dedupe still agrees with Redis
  | "document_hash" // recomputed from the scrubbed document
  | "document_hash_ref"; // follows document_hash for the same document

/** Which rows are copied. Tenant scopes follow the selected tenants (active by default). */
export type TableScope = "tenants" | "tenant_id" | "tenant_id_or_null" | "tenant_stable_id" | "tenant_stable_id_or_null" | "all";

export interface TablePolicy {
  schema: "public" | "auth";
  table: string;
  scope: TableScope;
  columns: Record<string, ColumnRule>;
  /** Absent in older schemas (pending migrations); copied when the source has it. */
  optional?: boolean;
  /** Only these source columns are read; every other source column is ignored by design. */
  readOnlyListed?: boolean;
}

const keep = (...names: string[]): Record<string, ColumnRule> => Object.fromEntries(names.map((name) => [name, "keep" as const]));

export const TABLE_POLICIES: TablePolicy[] = [
  {
    schema: "public", table: "tenants", scope: "tenants",
    columns: {
      ...keep("id", "site_name", "industry", "active", "created_at", "template", "delivery_model", "production_domain",
        "admin_domain", "subscription_status", "subscription_started_at", "subscription_past_due_since", "commitment_ends_at",
        "plan_override", "auto_publish", "auto_approve_threshold", "business_rules", "personality", "features", "integrations",
        "custom_domains", "booking_provider", "booking_url", "resend_domain", "site_url", "updated_at", "behold_feed_id",
        "subscription_plan", "plan_monthly_cents", "plan_currency", "stable_id", "billing_type", "account_id"),
      owner_name: "owner_name", owner_email: "email", owner_phone: "phone", referred_by: "name",
      stripe_customer_id: "stripe", stripe_subscription_id: "stripe",
      revalidate_url: "neutral_url", slack_webhook_url: "neutral_url",
      revalidation_secret: "secret", google_search_console_key: "secret", instagram_access_token: "secret",
      business_hours: "public_json", custom_repo: "public_json", visibility: "public_json", site_capabilities: "public_json",
      branding: "public_json", social_config: "public_json", reviews_config: "public_json",
    },
  },
  { schema: "public", table: "users", scope: "all", columns: { ...keep("id", "verified_at", "created_at"), email: "email", clerk_id: "external_user_id" } },
  {
    // Only identity and verification are read. Passwords, phone, metadata and
    // every auth token column are never selected from the source.
    schema: "auth", table: "users", scope: "all", readOnlyListed: true,
    columns: { ...keep("id", "email_confirmed_at"), email: "email" },
  },
  { schema: "public", table: "super_admins", scope: "all", columns: { ...keep("user_id", "granted_at", "granted_by", "revoked_at"), email: "email" } },
  { schema: "public", table: "memberships", scope: "tenant_id", columns: keep("id", "user_id", "tenant_id", "role", "assigned_at", "assigned_by", "tenant_stable_id") },
  {
    schema: "public", table: "domain_claims", scope: "tenant_id",
    columns: keep("tenant_id", "domain", "role", "status", "dns_status", "ssl_status", "verification", "vercel_project_id", "error",
      "created_at", "updated_at", "tenant_stable_id", "registration_attempt"),
  },
  { schema: "public", table: "content", scope: "tenant_id", columns: { ...keep("tenant_id", "section", "version", "updated_at", "tenant_stable_id"), data: "public_json" } },
  {
    schema: "public", table: "bookings", scope: "tenant_id",
    columns: {
      ...keep("id", "tenant_id", "service_id", "service_name", "date", "start_time", "end_time", "status", "created_at", "cancelled_at", "tenant_stable_id"),
      client_name: "name", client_email: "email", client_phone: "phone", notes: "text",
    },
  },
  {
    schema: "public", table: "accounts", scope: "all",
    columns: {
      ...keep("id", "name", "status", "created_at", "updated_at"),
      primary_contact_name: "name", primary_contact_email: "email", phone: "phone", billing_email: "email",
      stripe_customer_id: "stripe", notes: "text",
    },
  },
  { schema: "public", table: "account_memberships", scope: "all", columns: keep("id", "account_id", "user_id", "role", "created_at", "created_by") },
  {
    schema: "public", table: "subscriptions", scope: "all",
    columns: { ...keep("id", "account_id", "plan", "status", "amount_cents", "currency", "current_period_end", "created_at", "updated_at"), stripe_customer_id: "stripe", stripe_subscription_id: "stripe" },
  },
  {
    schema: "public", table: "subscription_items", scope: "tenant_id_or_null",
    columns: { ...keep("id", "subscription_id", "tenant_id", "amount_cents", "created_at"), stripe_item_id: "stripe", stripe_price_id: "stripe" },
  },
  { schema: "public", table: "workspaces", scope: "all", optional: true, columns: { ...keep("id", "kind", "created_by", "created_at", "updated_at"), name: "workspace_name" } },
  { schema: "public", table: "workspace_memberships", scope: "all", optional: true, columns: keep("workspace_id", "user_id", "role", "created_by", "created_at") },
  {
    schema: "public", table: "tenant_leads", scope: "tenant_stable_id", optional: true,
    columns: {
      ...keep("id", "tenant_stable_id", "tenant_slug_at_capture", "workspace_id", "lead_id", "source", "capability_id", "capability_version", "captured_at", "recorded_at", "recorded_via"),
      submission_hash: "lead_hash", name: "name", email: "email", message: "text", fields: "lead_fields",
    },
  },
  {
    schema: "public", table: "tenant_workspace_links", scope: "tenant_stable_id_or_null", optional: true,
    columns: { ...keep("id", "tenant_stable_id", "tenant_slug_at_link", "workspace_id", "linked_by", "linked_at", "command_id", "command_digest"), receipt: "public_json" },
  },
  { schema: "public", table: "business_records", scope: "all", optional: true, columns: keep("workspace_id", "revision", "last_sequence", "created_by", "created_at", "updated_by", "updated_at") },
  {
    schema: "public", table: "website_documents", scope: "all", optional: true,
    columns: { ...keep("workspace_id", "website_work_id", "revision", "created_by", "created_at"), content_hash: "document_hash", document: "public_json" },
  },
  {
    schema: "public", table: "website_document_heads", scope: "all", optional: true,
    columns: { ...keep("workspace_id", "website_work_id", "revision", "approved_revision", "approved_by", "approved_at"), approved_hash: "document_hash_ref" },
  },
  {
    schema: "public", table: "website_document_publications", scope: "tenant_id", optional: true,
    columns: { ...keep("tenant_id", "workspace_id", "website_work_id", "revision", "published_at"), content_hash: "document_hash_ref", receipt: "public_json" },
  },
  {
    schema: "public", table: "website_document_receipts", scope: "all", optional: true,
    columns: { ...keep("id", "workspace_id", "website_work_id", "revision", "created_at"), receipt: "public_json" },
  },
];

/** Tables that conversion does not need and that are deliberately left out. Listed so the receipt says so. */
export const TABLES_LEFT_OUT = [
  "integrations (provider tokens)", "workspace_calendar_connections (OAuth secrets)", "public_website_bookings and grants (visitor tokens)",
  "content_versions, drafts, audit and activity history", "reviews", "business_record_facts/services/people/contacts/revisions",
  "every other table",
];

export function policyKey(policy: Pick<TablePolicy, "schema" | "table">): string {
  return `${policy.schema}.${policy.table}`;
}

/** Fail closed: every column the source has must have a rule, or the run stops. */
export function uncoveredColumns(policy: TablePolicy, sourceColumns: string[]): string[] {
  if (policy.readOnlyListed) return [];
  return sourceColumns.filter((column) => !(column in policy.columns));
}

/** Columns actually read from the source: ruled columns the source really has. */
export function columnsToRead(policy: TablePolicy, sourceColumns: string[]): string[] {
  const present = new Set(sourceColumns);
  return Object.keys(policy.columns).filter((column) => present.has(column));
}

export interface RowContext {
  /** Old document hash -> new document hash, filled by website_documents rows. */
  documentHashes: Map<string, string>;
  documentHash?: (document: unknown) => string;
  leadHash?: (lead: { name: string; email?: string; message?: string; fields?: Record<string, string>; capabilityId?: string; capabilityVersion?: number }) => string;
}

function scrubColumn(p: Pseudonymizer, rule: ColumnRule, column: string, value: unknown, row: Record<string, unknown>): unknown {
  if (value === null || value === undefined) return value;
  switch (rule) {
    case "keep": return scrubJson(p, value, "public", column);
    case "public_json": return scrubJson(p, value, "public", column);
    case "personal_json": return scrubJson(p, value, "personal", column);
    case "lead_fields": return scrubLeadFields(p, value);
    case "email": return typeof value === "string" ? p.email(value) : value;
    case "phone": return typeof value === "string" ? p.phone(value) : value;
    case "name": return typeof value === "string" ? p.name(value) : value;
    case "text": return typeof value === "string" ? p.text(value) : value;
    case "secret": return typeof value === "string" ? p.secret(value) : SECRET_PLACEHOLDER;
    case "stripe": return typeof value === "string" ? p.opaqueId(stripePrefix(value), value) : value;
    case "neutral_url": return typeof value === "string" && value ? NEUTRAL_URL : value;
    case "external_user_id": return typeof value === "string" ? p.opaqueId("user", value) : value;
    case "owner_name": {
      if (typeof value !== "string") return value;
      const site = typeof row.site_name === "string" ? row.site_name : "";
      return value.trim().toLowerCase() === site.trim().toLowerCase() ? value : p.name(value);
    }
    case "workspace_name": return typeof value === "string" && row.kind === "personal" ? `${p.name(value)}'s workspace` : scrubJson(p, value, "public", column);
    case "lead_hash":
    case "document_hash":
    case "document_hash_ref":
      return value; // resolved in scrubRow, which sees the whole row
  }
}

function stripePrefix(value: string): string {
  const match = /^([a-z]+)_/.exec(value);
  return match?.[1] ?? "stripe";
}

/** Scrub one source row. Only ruled columns survive. */
export function scrubRow(p: Pseudonymizer, policy: TablePolicy, row: Record<string, unknown>, context: RowContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const rule = policy.columns[column];
    if (!rule) throw new Error(`No scrub rule for ${policyKey(policy)}.${column}; refusing to copy it.`);
    out[column] = scrubColumn(p, rule, column, value, row);
  }
  for (const [column, rule] of Object.entries(policy.columns)) {
    if (!(column in row) || row[column] === null) continue;
    if (rule === "document_hash") {
      const document = out.document;
      const original = String(row[column]);
      const next = document !== undefined && context.documentHash ? safeHash(context.documentHash, document, p, original) : p.digest("document", original);
      context.documentHashes.set(original, next);
      out[column] = next;
    } else if (rule === "document_hash_ref") {
      const original = String(row[column]);
      out[column] = context.documentHashes.get(original) ?? p.digest("document", original);
    } else if (rule === "lead_hash") {
      out[column] = context.leadHash
        ? context.leadHash({
          name: String(out.name ?? ""),
          email: typeof out.email === "string" ? out.email : undefined,
          message: typeof out.message === "string" ? out.message : undefined,
          fields: out.fields && typeof out.fields === "object" ? out.fields as Record<string, string> : undefined,
          capabilityId: typeof out.capability_id === "string" ? out.capability_id : undefined,
          capabilityVersion: typeof out.capability_version === "number" ? out.capability_version : undefined,
        })
        : p.digest("lead-hash", String(row[column])).slice(0, 8);
    }
  }
  return out;
}

/** A document the current schema rejects still gets a stable, valid-looking hash. */
function safeHash(hash: (document: unknown) => string, document: unknown, p: Pseudonymizer, original: string): string {
  try {
    return hash(document);
  } catch {
    return p.digest("document", original);
  }
}

// ---------------------------------------------------------------------------
// Redis keys
// ---------------------------------------------------------------------------

export type RedisValue =
  | { type: "string"; value: string }
  | { type: "zset"; value: Array<[string, number]> }
  | { type: "set"; value: string[] }
  | { type: "list"; value: string[] }
  | { type: "hash"; value: Record<string, string> };

export interface RedisRecord {
  key: string;
  family: string;
  tenant: string | null;
  data: RedisValue;
  /** Absolute expiry in epoch ms, or null when the key has no TTL. */
  expireAtMs: number | null;
}

type ValueKind = "lead" | "public" | "personal" | "event" | "connection" | "account" | "keep";

export interface RedisFamily {
  id: string;
  /** Glob for one tenant; `{t}` is the slug. */
  pattern: (tenant: string) => string;
  value: ValueKind;
  /** Reward keys embed the member email in the key name. */
  emailKeySegment?: boolean;
}

/**
 * Families conversion and its follow-up work read. Everything else in the
 * authoritative registry (src/lib/tenant-rename.ts) is counted and left out.
 */
export const INCLUDED_REDIS_FAMILIES: RedisFamily[] = [
  { id: "leads-index", pattern: (t) => `leads:${t}`, value: "keep" },
  { id: "lead", pattern: (t) => `lead:${t}:*`, value: "lead" },
  { id: "booking-config", pattern: (t) => `reb:booking:config:${t}`, value: "public" },
  { id: "booking-overrides", pattern: (t) => `reb:booking:overrides:${t}`, value: "personal" },
  { id: "events-index", pattern: (t) => `events:${t}`, value: "event" },
  { id: "connections", pattern: (t) => `connections:${t}:*`, value: "connection" },
  { id: "orders-index", pattern: (t) => `orders:${t}`, value: "keep" },
  { id: "order", pattern: (t) => `order:${t}:*`, value: "public" },
  { id: "rewards", pattern: (t) => `reb:rewards:${t}:*`, value: "personal", emailKeySegment: true },
  { id: "reply-voice", pattern: (t) => `reb:reply-voice:${t}`, value: "keep" },
  { id: "account-link", pattern: (t) => `account-of:${t}`, value: "keep" },
];

/** Keys found through an included family's values rather than a tenant pattern. */
export const DERIVED_REDIS_FAMILIES = {
  event: "event", // event:{id}, from events:{tenant}
  account: "account", // account:{id}, from account-of:{tenant}
  accountsIndex: "accounts-index", // accounts:index, filtered to copied accounts
} as const;

function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
}

export interface KeyClassification {
  family: string;
  tenant: string;
  included: boolean;
}

/** Classify a key against the selected tenants. Null: not tenant-scoped (left out unless derived). */
export function classifyRedisKey(key: string, tenants: string[]): KeyClassification | null {
  for (const tenant of tenants) {
    for (const family of INCLUDED_REDIS_FAMILIES) {
      if (globToRegExp(family.pattern(tenant)).test(key)) return { family: family.id, tenant, included: true };
    }
  }
  for (const tenant of tenants) {
    for (const pattern of authoritativePatterns(tenant)) {
      if (globToRegExp(pattern).test(key)) return { family: `left-out:${pattern.replace(tenant, "{t}")}`, tenant, included: false };
    }
  }
  return null;
}

export function familyById(id: string): RedisFamily | undefined {
  return INCLUDED_REDIS_FAMILIES.find((family) => family.id === id);
}

/** Pseudonymize email segments of a reward key: reb:rewards:{t}:member:{email}. */
export function scrubRedisKey(p: Pseudonymizer, key: string, family: RedisFamily | undefined): string {
  if (!family?.emailKeySegment) return key;
  return key.split(":").map((segment) => (segment.includes("@") ? p.email(segment) : segment)).join(":");
}

function parseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith("\"")) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

function scrubLead(p: Pseudonymizer, lead: unknown): unknown {
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) return scrubJson(p, lead, "personal");
  const record = lead as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "name") out[key] = typeof value === "string" ? p.name(value) : value;
    else if (key === "email") out[key] = typeof value === "string" ? p.email(value) : value;
    else if (key === "message") out[key] = typeof value === "string" ? p.text(value) : value;
    else if (key === "fields") out[key] = scrubLeadFields(p, value);
    else out[key] = scrubJson(p, value, "personal", key);
  }
  return out;
}

function scrubEvent(p: Pseudonymizer, event: unknown): unknown {
  if (!event || typeof event !== "object" || Array.isArray(event)) return scrubJson(p, event, "personal");
  const record = event as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => {
    if ((key === "title" || key === "body") && typeof value === "string") return [key, p.text(value)];
    return [key, scrubJson(p, value, "personal", key)];
  }));
}

function scrubConnection(p: Pseudonymizer, connection: unknown): unknown {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return scrubJson(p, connection, "personal");
  return Object.fromEntries(Object.entries(connection as Record<string, unknown>).map(([key, value]) => {
    if (["accessToken", "refreshToken", "apiKey", "idToken", "clientSecret"].includes(key) && typeof value === "string") return [key, p.secret(value)];
    return [key, scrubJson(p, value, "personal", key)];
  }));
}

/** Business name stays (it is the workspace name for multi-site accounts); the people on it do not. */
function scrubAccount(p: Pseudonymizer, account: unknown): unknown {
  if (!account || typeof account !== "object" || Array.isArray(account)) return scrubJson(p, account, "personal");
  return Object.fromEntries(Object.entries(account as Record<string, unknown>).map(([key, value]) => {
    if (key === "name" || key === "tenantIds" || key === "status") return [key, scrubJson(p, value, "public", key)];
    if (/stripe/i.test(key) && typeof value === "string") return [key, p.opaqueId(stripePrefix(value), value)];
    if (key === "subscription") return [key, scrubJson(p, value, "public", key)];
    return [key, scrubJson(p, value, "personal", key)];
  }));
}

export function scrubRedisString(p: Pseudonymizer, kind: ValueKind, raw: string): string {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    if (kind === "keep" || kind === "public") return p.scrubString(raw);
    return isStructuralToken(p.scrubString(raw)) ? p.scrubString(raw) : isEmailLike(raw) ? p.email(raw) : p.text(raw);
  }
  let value: unknown;
  switch (kind) {
    case "lead": value = scrubLead(p, parsed.value); break;
    case "event": value = scrubEvent(p, parsed.value); break;
    case "connection": value = scrubConnection(p, parsed.value); break;
    case "account": value = scrubAccount(p, parsed.value); break;
    case "public": value = scrubJson(p, parsed.value, "public"); break;
    case "personal": value = scrubJson(p, parsed.value, "personal"); break;
    case "keep": value = scrubJson(p, parsed.value, "public"); break;
  }
  return JSON.stringify(value);
}

/** Scrub a whole Redis value. Members and fields go through the same value rules. */
export function scrubRedisValue(p: Pseudonymizer, kind: ValueKind, data: RedisValue, emailMembers = false): RedisValue {
  const member = (value: string) => (emailMembers && isEmailLike(value) ? p.email(value) : scrubRedisString(p, kind, value));
  switch (data.type) {
    case "string": return { type: "string", value: scrubRedisString(p, kind, data.value) };
    case "zset": return { type: "zset", value: data.value.map(([value, score]) => [member(value), score]) };
    case "set": return { type: "set", value: data.value.map(member) };
    case "list": return { type: "list", value: data.value.map(member) };
    case "hash": return { type: "hash", value: Object.fromEntries(Object.entries(data.value).map(([field, value]) => [emailMembers && isEmailLike(field) ? p.email(field) : field, scrubRedisString(p, kind, value)])) };
  }
}

export function valueKindFor(familyId: string): ValueKind {
  if (familyId === DERIVED_REDIS_FAMILIES.event) return "event";
  if (familyId === DERIVED_REDIS_FAMILIES.account) return "account";
  if (familyId === DERIVED_REDIS_FAMILIES.accountsIndex) return "keep";
  return familyById(familyId)?.value ?? "personal";
}
