/**
 * Scrubbed production copy (Strelva Reborn section 3): scrubbing, refusals and
 * the receipt. The end-to-end run against local Postgres and Redis lives in
 * scrubbed-copy-e2e.test.ts (pnpm check:scrubbed-copy).
 */
import { describe, expect, it, vi } from "vitest";
import { phoneKey } from "@/platform/business-record/contracts";
import { NEUTRAL_URL, PSEUDO_EMAIL_DOMAIN, Pseudonymizer, SECRET_PLACEHOLDER } from "../../scripts/scrubbed-copy/pseudonymize";
import {
  TABLE_POLICIES, classifyRedisKey, columnsToRead, familyById, scrubRedisKey, scrubRedisValue, scrubRow, uncoveredColumns, type RowContext, type TablePolicy,
} from "../../scripts/scrubbed-copy/policy";
import {
  COPY_ENV_REQUIRED, RefusalError, assertCleanParentEnv, assertLocalDestinationUrl, assertLocalOutputDir,
  assertLoopbackBind, assertOutboundDisabled, copyEnvironment, parseEnvFile, renderEnvFile,
} from "../../scripts/scrubbed-copy/safety";
import { assertManifestHasNoPersonalData, findLeaks } from "../../scripts/scrubbed-copy/manifest";
import { READ_ONLY_REDIS_COMMANDS, ReadOnlyRestSource, type FetchLike } from "../../scripts/scrubbed-copy/redis";
import { buildExportSql, buildLoadSql, psqlTargetFromUrl, splitMigrations } from "../../scripts/scrubbed-copy/postgres";
import { preflightCreate, type CreateOptions } from "../../scripts/scrubbed-copy/run";

const SALT = "a".repeat(64);
const OTHER_SALT = "b".repeat(64);
const policy = (table: string): TablePolicy => TABLE_POLICIES.find((item) => item.table === table && item.schema === "public")!;
const context = (): RowContext => ({ documentHashes: new Map() });
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const tenantRow = {
  id: "alpha-studio", site_name: "Alpha Studio", owner_name: "Jane Realperson", owner_email: "Jane.Realperson@Gmail.com", owner_phone: "(716) 882-4417",
  industry: "wellness", active: true, created_at: "2026-01-02", template: "wellness", delivery_model: "custom_repo", production_domain: "alphastudio.com",
  admin_domain: null, referred_by: "Sam Referrer", stripe_customer_id: "cus_Q1w2E3r4T5y6U7i8", stripe_subscription_id: "sub_1PqRsTuVwXyZ012345",
  subscription_status: "active", subscription_started_at: null, subscription_past_due_since: null, commitment_ends_at: null, plan_override: null,
  auto_publish: false, auto_approve_threshold: 80, business_rules: "Call Jane at 716-882-4417 or jane.realperson@gmail.com", personality: null,
  business_hours: { mon: "9-5" }, features: ["booking"], integrations: ["google"], custom_domains: ["alphastudio.com"], booking_provider: null,
  booking_url: null, resend_domain: null, site_url: "https://alphastudio.com", revalidate_url: "https://alphastudio.com/api/revalidate",
  revalidation_secret: "rv_super_secret_value", custom_repo: { repoName: "alpha", supportedDesignTokens: ["colors"] }, visibility: null,
  site_capabilities: null, branding: null, social_config: { instagram: { accessToken: "IGQVJ_this_is_a_long_instagram_token_value_123" } },
  reviews_config: null, updated_at: "2026-09-01T00:00:00Z", behold_feed_id: "feed123", slack_webhook_url: "https://hooks.slack.com/services/T000/B000/XXXX",
  google_search_console_key: "gsc-verification-key-value", instagram_access_token: "IGQVJ_another_long_instagram_token_value_456",
  subscription_plan: "growth", plan_monthly_cents: 19900, plan_currency: "usd", stable_id: "c0ffee00-0000-4000-8000-0000000000a1",
  billing_type: "subscription", account_id: null,
};

describe("pseudonymizer", () => {
  it("is deterministic for one salt and different across salts", () => {
    const a = new Pseudonymizer(SALT);
    const b = new Pseudonymizer(SALT);
    const c = new Pseudonymizer(OTHER_SALT);
    expect(a.email("jane@example.com")).toBe(b.email("jane@example.com"));
    expect(a.name("Jane Realperson")).toBe(b.name("Jane Realperson"));
    expect(a.phone("716-882-4417")).toBe(b.phone("716-882-4417"));
    expect(a.email("jane@example.com")).not.toBe(c.email("jane@example.com"));
  });

  it("keeps a valid email valid and lowercase, and an invalid one invalid", () => {
    const p = new Pseudonymizer(SALT);
    const out = p.email("Jane.Realperson@Gmail.com");
    expect(out).toMatch(EMAIL_PATTERN);
    expect(out).toBe(out.toLowerCase());
    expect(out.endsWith(`@${PSEUDO_EMAIL_DOMAIN}`)).toBe(true);
    expect(p.email("jane.realperson@gmail.com")).toBe(out); // case variants dedupe the same way
    expect(p.email("not an email")).not.toMatch(EMAIL_PATTERN);
    expect(p.email(out)).toBe(out); // idempotent
  });

  it("keeps the planner's phoneKey identity and validity", () => {
    const p = new Pseudonymizer(SALT);
    const local = p.phone("(716) 882-4417");
    const e164 = p.phone("+1 716 882 4417");
    expect(phoneKey(local)).not.toBeNull();
    expect(phoneKey(local)).toBe(phoneKey(e164));
    expect(phoneKey(local)).not.toBe(phoneKey("(716) 882-4417"));
    expect(phoneKey(local)!.startsWith("1555")).toBe(true);
    expect(phoneKey(p.phone("+44 20 7946 0958"))).not.toBeNull();
    expect(phoneKey(p.phone("12"))).toBeNull();
    expect(p.phone(local)).toBe(local);
  });

  it("replaces credentials, Stripe ids, emails and phones inside free text", () => {
    const p = new Pseudonymizer(SALT);
    const out = p.scrubString("Key sk_live_51Habcdefghijklmnop, google ya29.a0AfH6SMBabcdefghijklmnopqrstu, enc:v1:abc:def:ghi, customer cus_Q1w2E3r4T5y6U7i8, mail jane@example.com, call (716) 882-4417, https://x.test/cb?token=abc123&ok=1");
    for (const original of ["sk_live_51H", "ya29.", "enc:v1:", "cus_Q1w2E3r4T5y6U7i8", "jane@example.com", "882-4417", "token=abc123"]) expect(out).not.toContain(original);
    expect(out).toContain(SECRET_PLACEHOLDER);
    expect(p.scrubString("status in_progress on 2026-10-05")).toBe("status in_progress on 2026-10-05");
  });
});

describe("table scrubbing", () => {
  it("scrubs a tenant row column by column and neutralizes outbound URLs and secrets", () => {
    const p = new Pseudonymizer(SALT);
    const out = scrubRow(p, policy("tenants"), tenantRow, context());
    expect(out.id).toBe("alpha-studio");
    expect(out.stable_id).toBe(tenantRow.stable_id);
    expect(out.site_name).toBe("Alpha Studio");
    expect(out.owner_name).not.toBe("Jane Realperson");
    expect(out.owner_email).toBe(p.email(tenantRow.owner_email));
    expect(out.revalidate_url).toBe(NEUTRAL_URL);
    expect(out.slack_webhook_url).toBe(NEUTRAL_URL);
    expect(out.revalidation_secret).toBe(SECRET_PLACEHOLDER);
    expect(out.instagram_access_token).toBe(SECRET_PLACEHOLDER);
    expect((out.social_config as { instagram: { accessToken: string } }).instagram.accessToken).toBe(SECRET_PLACEHOLDER);
    expect((out.custom_repo as { supportedDesignTokens: string[] }).supportedDesignTokens).toEqual(["colors"]);
    expect(out.stripe_customer_id).toMatch(/^cus_scrubbed[0-9a-f]{16}$/);
    expect(String(out.business_rules)).not.toContain("gmail.com");
    expect(String(out.business_rules)).not.toContain("882-4417");
    const text = JSON.stringify(out);
    for (const original of ["Realperson", "rv_super_secret_value", "IGQVJ_", "hooks.slack.com", "gsc-verification", "Sam Referrer"]) expect(text).not.toContain(original);
  });

  it("keeps an owner name that is the business name, so the planner still sees no person", () => {
    const p = new Pseudonymizer(SALT);
    const out = scrubRow(p, policy("tenants"), { ...tenantRow, owner_name: "Alpha Studio" }, context());
    expect(out.owner_name).toBe("Alpha Studio");
  });

  it("keeps joins intact across tables", () => {
    const p = new Pseudonymizer(SALT);
    const tenant = scrubRow(p, policy("tenants"), tenantRow, context());
    const user = scrubRow(p, policy("users"), { id: "u1", email: "jane.realperson@gmail.com", clerk_id: "user_2abcDEF", verified_at: null, created_at: null }, context());
    const admin = scrubRow(p, policy("super_admins"), { user_id: "u1", email: "JANE.realperson@gmail.com", granted_at: null, granted_by: null, revoked_at: null }, context());
    const subscription = scrubRow(p, policy("subscriptions"), { id: "s1", account_id: "a1", plan: "growth", status: "active", amount_cents: 1, currency: "usd", current_period_end: null, created_at: null, updated_at: null, stripe_customer_id: "cus_Q1w2E3r4T5y6U7i8", stripe_subscription_id: "sub_1PqRsTuVwXyZ012345" }, context());
    const booking = scrubRow(p, policy("bookings"), { id: "b1", tenant_id: "alpha-studio", service_id: "s", service_name: "Massage", date: "2026-10-01", start_time: "10:00", end_time: "11:00", client_name: "Pat Visitor", client_email: "pat@example.com", client_phone: "716-555-0000x", notes: "Back pain", status: "confirmed", created_at: null, cancelled_at: null, tenant_stable_id: null }, context());
    expect(user.email).toBe(tenant.owner_email);
    expect(admin.email).toBe(user.email);
    expect(subscription.stripe_customer_id).toBe(tenant.stripe_customer_id);
    expect(subscription.stripe_subscription_id).toBe(tenant.stripe_subscription_id);
    expect(user.id).toBe("u1");
    expect(booking.client_email).toBe(p.email("pat@example.com"));
    expect(booking.service_name).toBe("Massage");
  });

  it("fails closed on a column without a rule", () => {
    const p = new Pseudonymizer(SALT);
    expect(uncoveredColumns(policy("users"), ["id", "email", "phone_number"])).toEqual(["phone_number"]);
    expect(() => scrubRow(p, policy("users"), { id: "u1", phone_number: "716-882-4417" }, context())).toThrow(/No scrub rule/);
    const auth = TABLE_POLICIES.find((item) => item.schema === "auth")!;
    expect(uncoveredColumns(auth, ["id", "email", "encrypted_password", "phone"])).toEqual([]);
    expect(columnsToRead(auth, ["id", "email", "encrypted_password", "phone", "email_confirmed_at"])).toEqual(["id", "email_confirmed_at", "email"]);
  });

  it("rehashes scrubbed website documents and follows the hash in heads", () => {
    const p = new Pseudonymizer(SALT);
    const ctx: RowContext = { documentHashes: new Map(), documentHash: (doc) => `h${JSON.stringify(doc).length}`.padEnd(64, "0") };
    const doc = scrubRow(p, policy("website_documents"), { workspace_id: "w", website_work_id: "x", revision: 1, created_by: "u", created_at: null, content_hash: "a".repeat(64), document: { contact: { email: "jane@example.com" } } }, ctx);
    const head = scrubRow(p, policy("website_document_heads"), { workspace_id: "w", website_work_id: "x", revision: 1, approved_revision: 1, approved_by: "u", approved_at: null, approved_hash: "a".repeat(64) }, ctx);
    expect(doc.content_hash).not.toBe("a".repeat(64));
    expect(head.approved_hash).toBe(doc.content_hash);
    expect(JSON.stringify(doc.document)).not.toContain("jane@example.com");
  });
});

describe("redis scrubbing", () => {
  it("classifies keys by tenant without prefix collisions and leaves out unlisted families", () => {
    expect(classifyRedisKey("lead:gldf:lead_1", ["gld", "gldf"])).toEqual({ family: "lead", tenant: "gldf", included: true });
    expect(classifyRedisKey("threads:gldf:t1", ["gldf"])).toMatchObject({ included: false, tenant: "gldf" });
    expect(classifyRedisKey("reb:paylink:abc", ["gldf"])).toBeNull();
    expect(classifyRedisKey("lead:other:lead_1", ["gldf"])).toBeNull();
  });

  it("scrubs a lead record, keeping ids and the fields the planner reads", () => {
    const p = new Pseudonymizer(SALT);
    const lead = { id: "lead_1", name: "Pat Visitor", email: "pat@example.com", message: "My knee hurts, call 716-882-1111", source: "contact-form", fields: { phone: "716-882-1111", preferredDay: "weekday", Comments: "Private details" }, createdAt: "2026-10-01T10:00:00.000Z" };
    const out = scrubRedisValue(p, "lead", { type: "string", value: JSON.stringify(lead) });
    const parsed = JSON.parse((out as { value: string }).value);
    expect(parsed.id).toBe("lead_1");
    expect(parsed.source).toBe("contact-form");
    expect(parsed.createdAt).toBe(lead.createdAt);
    expect(parsed.email).toBe(p.email("pat@example.com"));
    expect(phoneKey(parsed.fields.phone)).toBe(phoneKey(p.phone("716-882-1111")));
    expect(parsed.fields.preferredDay).toBe("weekday");
    const text = JSON.stringify(parsed);
    for (const original of ["Pat Visitor", "pat@example.com", "knee", "882-1111", "Private details"]) expect(text).not.toContain(original);
  });

  it("removes OAuth tokens and keeps connection status", () => {
    const p = new Pseudonymizer(SALT);
    const out = scrubRedisValue(p, "connection", { type: "string", value: JSON.stringify({ provider: "google", tenantId: "alpha", accessToken: "ya29.a0secretsecretsecretsecret", refreshToken: "1//0gsecretsecretsecretsecret", status: "connected", scopes: ["https://www.googleapis.com/auth/business.manage"] }) });
    const parsed = JSON.parse((out as { value: string }).value);
    expect(parsed.accessToken).toBe(SECRET_PLACEHOLDER);
    expect(parsed.refreshToken).toBe(SECRET_PLACEHOLDER);
    expect(parsed.status).toBe("connected");
    expect(parsed.provider).toBe("google");
  });

  it("pseudonymizes reward member emails in key names and values consistently", () => {
    const p = new Pseudonymizer(SALT);
    const family = familyById("rewards");
    const key = scrubRedisKey(p, "reb:rewards:alpha:member:jane@example.com", family);
    expect(key).toBe(`reb:rewards:alpha:member:${p.email("jane@example.com")}`);
    const members = scrubRedisValue(p, "personal", { type: "set", value: ["jane@example.com"] }, true);
    expect(members).toEqual({ type: "set", value: [p.email("jane@example.com")] });
    const member = JSON.parse((scrubRedisValue(p, "personal", { type: "string", value: JSON.stringify({ email: "jane@example.com", displayName: "Jane R", birthday: "04-17", tier: "snapper", starsAvailable: 120 }) }) as { value: string }).value);
    expect(member.email).toBe(p.email("jane@example.com"));
    expect(member.displayName).not.toBe("Jane R");
    expect(member.birthday).toMatch(/^\d{2}-\d{2}$/);
    expect(member.tier).toBe("snapper");
    expect(member.starsAvailable).toBe(120);
  });

  it("replaces event titles and bodies but keeps execution state", () => {
    const p = new Pseudonymizer(SALT);
    const event = { id: "evt_1", tenantId: "alpha", source: "google", type: "review", title: "New review from Pat Visitor", body: "Great massage!", status: "pending", metadata: { reviewerName: "Pat Visitor", execution: { state: "completed", action: "approved", attemptId: "att_123456" } }, createdAt: "2026-10-01T00:00:00Z" };
    const parsed = JSON.parse((scrubRedisValue(p, "event", { type: "string", value: JSON.stringify(event) }) as { value: string }).value);
    expect(parsed.metadata.execution).toEqual(event.metadata.execution);
    expect(parsed.status).toBe("pending");
    expect(JSON.stringify(parsed)).not.toContain("Pat Visitor");
    expect(parsed.body).not.toBe("Great massage!");
  });
});

describe("leak check and manifest", () => {
  it("finds an original email, phone or secret that survived, without echoing it", () => {
    const p = new Pseudonymizer(SALT);
    p.email("jane@example.com");
    p.phone("716-882-4417");
    p.secret("ya29.a0secretsecretsecretsecret");
    const findings = findLeaks([
      { name: "clean.jsonl", text: JSON.stringify({ email: p.email("jane@example.com"), phone: p.phone("716-882-4417") }) },
      { name: "email.jsonl", text: "contact JANE@example.com" },
      { name: "phone.jsonl", text: "\"(716) 882 4417\"" },
      { name: "secret.jsonl", text: "\"ya29.a0secretsecretsecretsecret\"" },
    ], p.originals);
    expect(findings).toEqual([
      { file: "email.jsonl", kind: "email" },
      { file: "phone.jsonl", kind: "phone" },
      { file: "secret.jsonl", kind: "secret" },
    ]);
    expect(JSON.stringify(findings)).not.toContain("jane");
  });

  it("refuses a manifest that carries personal data and accepts scrubbed counts", () => {
    const p = new Pseudonymizer(SALT);
    p.email("jane@example.com");
    expect(() => assertManifestHasNoPersonalData({ tenants: [{ slug: "alpha", note: "jane@example.com" }] })).toThrow(/email/);
    expect(() => assertManifestHasNoPersonalData({ note: "call 716-882-4417" })).toThrow(/phone/);
    expect(() => assertManifestHasNoPersonalData({ note: "jane@example" }, p.originals)).not.toThrow();
    expect(() => assertManifestHasNoPersonalData({ tenants: [{ slug: "alpha", postgresRows: { "public.bookings": 3 } }], operator: `operator@${PSEUDO_EMAIL_DOMAIN}` }, p.originals)).not.toThrow();
  });
});

describe("source access is read-only", () => {
  it("never sends a write command to the source Redis", async () => {
    const fetcher = vi.fn<FetchLike>();
    const source = new ReadOnlyRestSource("https://example.upstash.io", "token", fetcher);
    for (const command of ["SET", "DEL", "FLUSHALL", "EVAL", "CONFIG", "ZADD", "EXPIRE"]) {
      await expect(source.call([command, "k", "v"])).rejects.toThrow(/only reads/);
    }
    await expect(source.pipeline([["GET", "a"], ["DEL", "a"]])).rejects.toThrow(/only reads/);
    expect(fetcher).not.toHaveBeenCalled();
    expect([...READ_ONLY_REDIS_COMMANDS].every((name) => !["SET", "DEL", "EVAL", "EVALSHA", "EXPIRE", "FLUSHALL", "FLUSHDB", "RENAME", "COPY", "MIGRATE"].includes(name))).toBe(true);
  });

  it("decodes base64 replies from the REST API", async () => {
    const fetcher: FetchLike = async (_url, init) => {
      expect(init.headers["Upstash-Encoding"]).toBe("base64");
      expect(JSON.parse(init.body)).toEqual([["GET", "k"]]);
      return { ok: true, status: 200, text: async () => JSON.stringify([{ result: Buffer.from("{\"a\":1}").toString("base64") }]) };
    };
    await expect(new ReadOnlyRestSource("https://example.upstash.io", "token", fetcher).call(["GET", "k"])).resolves.toBe("{\"a\":1}");
  });

  it("reads Postgres in one read-only snapshot, proves it before any row, and never selects auth secrets", () => {
    const plan = TABLE_POLICIES.filter((item) => !item.optional).map((item) => ({ policy: item, columns: Object.keys(item.columns) }));
    const sql = buildExportSql(plan, false);
    expect(sql).toMatch(/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
    expect(sql.indexOf("SHOW transaction_read_only")).toBeLessThan(sql.indexOf("SELECT row_to_json"));
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT)\b/i);
    const authLine = sql.split("\n").find((line) => line.includes("FROM \"auth\".\"users\""))!;
    expect(authLine).not.toMatch(/password|phone|meta|token/);
    expect(sql).toContain("FROM public.tenants WHERE active");
  });

  it("passes source credentials through the environment, not argv", () => {
    const target = psqlTargetFromUrl("postgresql://reader:s3cr%40t@db.example.supabase.co:6543/postgres");
    expect(target.env).toMatchObject({ PGHOST: "db.example.supabase.co", PGPORT: "6543", PGUSER: "reader", PGPASSWORD: "s3cr@t", PGSSLMODE: "require" });
  });

  it("loads at the source's migration level and applies pending migrations after", () => {
    const repo = ["20260101000000", "20260930120000", "20261002120000", "20261005090000"].map((version) => ({ version, file: `${version}_x.sql` }));
    const split = splitMigrations(repo, ["20260101000000", "20260930120000", "20260999999999"]);
    expect(split.beforeLoad.map((item) => item.version)).toEqual(["20260101000000", "20260930120000"]);
    expect(split.afterLoad.map((item) => item.version)).toEqual(["20261002120000", "20261005090000"]);
    expect(split.sourceOnly).toEqual(["20260999999999"]);
    expect(buildLoadSql([{ relation: "public.users", file: "/tmp/x/public.users.jsonl", columns: ["id", "email"] }])).toContain("SET session_replication_role = replica;");
  });
});

describe("refusals", () => {
  const env = {
    SCRUBBED_COPY_SOURCE_DATABASE_URL: "postgresql://reader:pw@db.prod.example:5432/postgres",
    SCRUBBED_COPY_SOURCE_REDIS_REST_URL: "https://prod.upstash.example",
    SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN: "readonly-token",
  };
  const base: CreateOptions = {
    out: "/tmp/strelva-scrubbed-copy-unit-test-never-created", source: "db.prod.example", sourceRedis: "prod.upstash.example", confirmed: true,
    skipRedis: false, includeInactive: false, replace: false, saltFile: "/tmp/never", repoRoot: process.cwd(), env,
  };

  it("accepts a fully explicit, confirmed, local run", () => {
    expect(preflightCreate(base)).toEqual({ databaseUrl: env.SCRUBBED_COPY_SOURCE_DATABASE_URL, redisUrl: env.SCRUBBED_COPY_SOURCE_REDIS_REST_URL });
  });

  it("refuses without confirmation or an explicit, matching source", () => {
    expect(() => preflightCreate({ ...base, confirmed: false })).toThrow(/Jacob's yes/);
    expect(() => preflightCreate({ ...base, source: undefined })).toThrow(/--source/);
    expect(() => preflightCreate({ ...base, source: "db.staging.example" })).toThrow(/does not match/);
    expect(() => preflightCreate({ ...base, sourceRedis: "other.upstash.example" })).toThrow(/does not match/);
    expect(() => preflightCreate({ ...base, env: { ...env, SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN: "" } })).toThrow(/read-only token/);
    expect(() => preflightCreate({ ...base, env: { ...env, SCRUBBED_COPY_SOURCE_DATABASE_URL: "https://db.prod.example" } })).toThrow(/postgres/);
    expect(preflightCreate({ ...base, skipRedis: true, sourceRedis: undefined }).redisUrl).toBeNull();
  });

  it("refuses any non-local destination", () => {
    const dir = { exists: false, empty: true, isCopy: false, replace: false, repoRoot: process.cwd() };
    expect(() => assertLocalOutputDir("s3://bucket/copy", dir)).toThrow(RefusalError);
    expect(() => assertLocalOutputDir("host:/srv/copy", dir)).toThrow(/local directory/);
    expect(() => assertLocalOutputDir("relative/copy", dir)).toThrow(/absolute/);
    expect(() => assertLocalOutputDir(`${process.cwd()}/copy`, dir)).toThrow(/inside the repository/);
    expect(() => assertLocalOutputDir("/Users/j/Library/Mobile Documents/com~apple~CloudDocs/copy", dir)).toThrow(/cloud-synced/);
    expect(() => assertLocalOutputDir("/Users/j/Library/CloudStorage/Dropbox/copy", dir)).toThrow(/cloud-synced/);
    expect(() => assertLocalOutputDir("/Volumes/share/copy", dir)).toThrow(/mounted volume/);
    expect(() => assertLocalOutputDir("/tmp/x", { ...dir, exists: true, empty: false })).toThrow(/not a scrubbed copy/);
    expect(() => assertLocalOutputDir("/tmp/x", { ...dir, exists: true, empty: false, isCopy: true })).toThrow(/--replace/);
    expect(() => preflightCreate({ ...base, destDatabaseUrl: "postgresql://postgres@db.remote.example:5432/postgres" })).toThrow(/not a local/);
    expect(() => assertLocalDestinationUrl("dest", "postgresql://me@127.0.0.1:5432/copy")).not.toThrow();
    expect(() => assertLocalDestinationUrl("dest", "postgresql:///copy?host=/tmp/sock")).not.toThrow();
    expect(() => assertLoopbackBind("0.0.0.0")).toThrow(/127.0.0.1/);
    expect(() => assertLoopbackBind("127.0.0.1")).not.toThrow();
  });

  it("refuses to run app code unless email, Stripe and Google are all disabled", () => {
    const good = { ...COPY_ENV_REQUIRED };
    expect(() => assertOutboundDisabled(good)).not.toThrow();
    for (const [name, value] of [
      ["EMAIL_SENDING_ENABLED", "true"], ["OPERATOR_EMAILS_ENABLED", "true"], ["CUSTOMER_EMAIL_ENABLED", "true"], ["RESEND_API_KEY", "re_x"],
      ["STRIPE_SECRET_KEY", "sk_test_x"], ["GOOGLE_CLIENT_SECRET", "x"], ["GOOGLE_CALENDAR_CLIENT_ID", "x"], ["SUPABASE_URL", "https://x.supabase.co"],
    ]) {
      expect(() => assertOutboundDisabled({ ...good, [name!]: value })).toThrow(new RegExp(name!));
    }
    expect(() => assertOutboundDisabled({ ...good, OPERATOR_EMAILS_ENABLED: undefined as never })).toThrow(/OPERATOR_EMAILS_ENABLED/);
    expect(() => assertOutboundDisabled({ ...good, UPSTASH_REDIS_REST_URL: "https://prod.upstash.io" })).toThrow(/not loopback/);
    expect(() => assertOutboundDisabled({ ...good, UPSTASH_REDIS_REST_URL: "http://127.0.0.1:1234" })).not.toThrow();
    const rendered = renderEnvFile(copyEnvironment({ UPSTASH_REDIS_REST_URL: "http://127.0.0.1:1" }, { PATH: "/bin", STRIPE_SECRET_KEY: "sk_live_inherited" }));
    expect(rendered).not.toContain("sk_live_inherited");
    expect(() => assertOutboundDisabled(parseEnvFile(rendered))).not.toThrow();
    expect(() => assertOutboundDisabled(parseEnvFile(rendered.replace("RESEND_API_KEY=", "RESEND_API_KEY=re_live")))).toThrow(/RESEND_API_KEY/);
  });

  it("refuses a shell that has production app credentials loaded", () => {
    expect(() => assertCleanParentEnv({ ...env })).not.toThrow();
    expect(() => assertCleanParentEnv({ STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => assertCleanParentEnv({ SUPABASE_URL: "https://ref.supabase.co" })).toThrow(/SUPABASE_URL/);
    expect(() => assertCleanParentEnv({ VERCEL_ENV: "production" })).toThrow(/VERCEL_ENV/);
    expect(() => preflightCreate({ ...base, env: { ...env, RESEND_API_KEY: "re_live" } })).toThrow(/RESEND_API_KEY/);
  });
});
