/**
 * End-to-end proof of the scrubbed production copy against a FAKE source:
 * a throwaway local Postgres cluster at production's migration level, seeded
 * with fixture tenants, and a throwaway local redis-server behind the same
 * Upstash REST protocol production uses. Nothing here contacts a hosted service.
 *
 * Runs with `pnpm check:scrubbed-copy` (needs PostgreSQL 18 binaries and
 * redis-server on PATH). Skipped in the default `pnpm test` run.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "@upstash/redis";
import { siteDocumentHash, type SiteDocument } from "@/products/websites";
import { leadSubmissionHash } from "@/lib/leads";
import { createCopy, dryRunCopy, startCopy, type CopyHooks } from "../../scripts/scrubbed-copy/run";
import { projectDevFiles } from "../../scripts/scrubbed-copy/dev-files";
import { initCluster, psql, psqlFile, repoMigrations, run, socketTarget, type PsqlTarget } from "../../scripts/scrubbed-copy/postgres";
import { RespClient, startLocalRedis, startUpstashBridge, type LocalRedis, type UpstashBridge } from "../../scripts/scrubbed-copy/redis";
import type { CopyManifest } from "../../scripts/scrubbed-copy/manifest";

const ENABLED = process.env.SCRUBBED_COPY_E2E === "1";
const repoRoot = path.resolve(__dirname, "../..");
/** The production migration level recorded in scripts/check-workspace-upgrade.sh. */
const PRODUCTION_LEVEL = "20260930120000";

const ORIGINALS = [
  "jane.owner@gmail.com", "bob.baker@yahoo.com", "jacob.admin@strelva.com", "carl.closed@aol.com", "pat.visitor@gmail.com",
  "quinn.lead@hotmail.com", "rita.rewards@gmail.com", "billing.jane@gmail.com", "hello@alphastudio.example", "orders@bravobakery.example",
  "882-4417", "8824417", "882-1111", "8821111", "883-5520", "8835520",
  "Jane Owner", "Pat Visitor", "Quinn Lead", "Pat Customer", "Rita Rewards", "knee hurts", "Back pain", "Christmas with Jane", "Prefers calls",
  "IGQVJ_", "rv_secret_alpha", "hooks.slack.com", "ya29.", "1//0g", "$2a$10$", "cus_TenantQ1w2E3r4", "sub_TenantQ1w2E3r4T5", "cus_AcctQ1w2E3r4T5y6",
  "threads-secret-conversation",
];

const SEED_SQL = `
alter table auth.users add column encrypted_password text, add column phone text, add column raw_user_meta_data jsonb;
insert into auth.users(id,email,email_confirmed_at,encrypted_password,phone,raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111','jane.owner@gmail.com',now(),'$2a$10$hashjane','+17168824417','{"full_name":"Jane Owner"}'),
  ('22222222-2222-4222-8222-222222222222','bob.baker@yahoo.com',now(),'$2a$10$hashbob',null,'{}'),
  ('33333333-3333-4333-8333-333333333333','jacob.admin@strelva.com',now(),'$2a$10$hashjacob',null,'{}'),
  ('44444444-4444-4444-8444-444444444444','carl.closed@aol.com',now(),'$2a$10$hashcarl',null,'{}');
insert into public.users(id,email,verified_at) values
  ('11111111-1111-4111-8111-111111111111','jane.owner@gmail.com',now()),
  ('22222222-2222-4222-8222-222222222222','bob.baker@yahoo.com',now()),
  ('33333333-3333-4333-8333-333333333333','jacob.admin@strelva.com',now()),
  ('44444444-4444-4444-8444-444444444444','carl.closed@aol.com',now())
  on conflict (id) do update set verified_at = excluded.verified_at;
insert into public.super_admins(user_id,email) values ('33333333-3333-4333-8333-333333333333','jacob.admin@strelva.com');
insert into public.accounts(id,name,primary_contact_name,primary_contact_email,phone,stripe_customer_id,billing_email,status,notes) values
  ('aaaaaaaa-0000-4000-8000-000000000001','Lakeside Group','Jane Owner','jane.owner@gmail.com','716-882-4417','cus_AcctQ1w2E3r4T5y6','billing.jane@gmail.com','active','Prefers calls after 5');
insert into public.account_memberships(account_id,user_id,role) values ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','owner');
insert into public.subscriptions(account_id,plan,status,amount_cents,currency,stripe_customer_id,stripe_subscription_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001','growth','active',29900,'usd','cus_AcctQ1w2E3r4T5y6','sub_AcctQ1w2E3r4T5y6U7');
insert into public.tenants(id,site_name,owner_name,owner_email,owner_phone,active,stable_id,stripe_customer_id,stripe_subscription_id,subscription_status,
  revalidate_url,revalidation_secret,instagram_access_token,slack_webhook_url,social_config,account_id,site_url,production_domain,plan_monthly_cents,subscription_plan,billing_type,created_at) values
  ('alpha-studio','Alpha Studio','Jane Owner','jane.owner@gmail.com','(716) 882-4417',true,'c0ffee00-0000-4000-8000-0000000000a1','cus_TenantQ1w2E3r4','sub_TenantQ1w2E3r4T5','active',
   'https://alphastudio.example/api/revalidate','rv_secret_alpha_123','IGQVJ_long_instagram_token_alpha_1234567890','https://hooks.slack.com/services/T1/B1/secretalpha',
   '{"instagram":{"accessToken":"IGQVJ_nested_token_alpha_1234567890"}}','aaaaaaaa-0000-4000-8000-000000000001','https://alphastudio.example','alphastudio.example',19900,'growth','tier','2026-01-02'),
  ('bravo-bakery','Bravo Bakery','Bravo Bakery','bob.baker@yahoo.com','716-883-5520',true,'c0ffee00-0000-4000-8000-0000000000a2',null,null,'active',
   null,null,null,null,null,'aaaaaaaa-0000-4000-8000-000000000001','https://bravobakery.example','bravobakery.example',9900,'presence','tier','2026-02-03'),
  ('charlie-closed','Charlie Closed','Carl Closed','carl.closed@aol.com','716-884-6631',false,'c0ffee00-0000-4000-8000-0000000000a3',null,null,'canceled',
   null,null,null,null,null,null,'https://charlie.example','charlie.example',0,null,'none','2026-03-04');
insert into public.subscription_items(subscription_id,tenant_id,stripe_item_id,stripe_price_id,amount_cents)
  select id,'alpha-studio','si_ItemQ1w2E3r4T5y6U7','price_PriceQ1w2E3r4T5y6',19900 from public.subscriptions;
insert into public.memberships(user_id,tenant_id,role) values
  ('11111111-1111-4111-8111-111111111111','alpha-studio','owner'),
  ('22222222-2222-4222-8222-222222222222','bravo-bakery','owner'),
  ('44444444-4444-4444-8444-444444444444','charlie-closed','owner');
insert into public.domain_claims(tenant_id,domain,role,status,dns_status,ssl_status) values
  ('alpha-studio','alphastudio.example','production','verified','configured','issued');
insert into public.content(tenant_id,section,data) values
  ('alpha-studio','contact','{"email":"hello@alphastudio.example","phone":"(716) 882-4417","address":"12 Elm St, Buffalo NY"}'),
  ('alpha-studio','siteSettings','{"siteDescription":"Massage in Buffalo. Questions? jane.owner@gmail.com"}'),
  ('alpha-studio','services','{"services":[{"id":"s1","name":"Deep Tissue","duration":"60 min","price":"$90"},{"id":"s2","name":"Swedish","duration":"45 min","price":"$70"}]}'),
  ('alpha-studio','testimonials','{"testimonials":[{"name":"Pat Customer","quote":"Loved it"}]}'),
  ('bravo-bakery','contact','{"email":"orders@bravobakery.example","phone":"716-883-5520"}'),
  ('charlie-closed','contact','{"email":"carl.closed@aol.com"}');
insert into public.bookings(id,tenant_id,service_id,service_name,date,start_time,end_time,client_name,client_email,client_phone,notes,status) values
  ('bk_a1','alpha-studio','s1','Deep Tissue','2026-10-20','10:00','11:00','Pat Visitor','pat.visitor@gmail.com','716-882-1111','Back pain','confirmed'),
  ('bk_c1','charlie-closed','s1','Old','2026-01-20','10:00','11:00','Carl Closed','carl.closed@aol.com','716-884-6631',null,'confirmed');
insert into public.workspaces(id,kind,name,created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000001','personal','Jane Owner','11111111-1111-4111-8111-111111111111');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','owner','11111111-1111-4111-8111-111111111111');
`;

async function seedRedis(client: RespClient): Promise<void> {
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60;
  const lead = (id: string, name: string, email: string, message: string, phone: string) =>
    JSON.stringify({ id, name, email, message, source: "contact-form", fields: { phone }, createdAt: new Date(now - 3600_000).toISOString() });
  const commands: Array<Array<string | number>> = [
    ["ZADD", "leads:alpha-studio", now - 1000, "lead_a1", now, "lead_a2"],
    ["SET", "lead:alpha-studio:lead_a1", lead("lead_a1", "Pat Visitor", "pat.visitor@gmail.com", "My knee hurts, call 716-882-1111", "716-882-1111"), "EX", ninetyDays],
    ["SET", "lead:alpha-studio:lead_a2", lead("lead_a2", "Quinn Lead", "quinn.lead@hotmail.com", "Gift card?", "716-882-2222"), "EX", ninetyDays],
    ["SET", "reb:booking:config:alpha-studio", JSON.stringify({ timezone: "America/New_York", slotMinutes: 30, weekly: { mon: [{ start: "09:00", end: "17:00" }] } })],
    ["SET", "reb:booking:overrides:alpha-studio", JSON.stringify([{ date: "2026-12-25", available: false, reason: "Christmas with Jane" }])],
    ["ZADD", "events:alpha-studio", now, "evt_a1"],
    ["SET", "event:evt_a1", JSON.stringify({ id: "evt_a1", tenantId: "alpha-studio", source: "google", type: "review", title: "New review from Pat Visitor", body: "My knee hurts less!", status: "pending", metadata: { reviewerName: "Pat Visitor" }, createdAt: new Date(now).toISOString() })],
    ["SET", "connections:alpha-studio:google", JSON.stringify({ provider: "google", tenantId: "alpha-studio", accessToken: "ya29.a0AfH6SMBsecretsecretsecretsecret", refreshToken: "1//0gsecretsecretsecretsecretsecret", status: "connected", scopes: ["business.manage"] })],
    ["ZADD", "orders:bravo-bakery", now, "ord_b1"],
    ["SET", "order:bravo-bakery:ord_b1", JSON.stringify({ id: "ord_b1", amountCents: 1200, currency: "usd", itemCount: 1, items: [{ name: "Sourdough", quantity: 1, amountCents: 1200 }], createdAt: new Date(now).toISOString() })],
    ["SET", "reb:rewards:bravo-bakery:member:rita.rewards@gmail.com", JSON.stringify({ email: "rita.rewards@gmail.com", displayName: "Rita Rewards", birthday: "04-17", starsAvailable: 120, starsLifetime: 300, tier: "snapper", tierOverride: null, favoriteFruit: "cherry", badges: [], subscriptionBonusClaimed: false, createdAt: new Date(now).toISOString() })],
    ["SADD", "reb:rewards:bravo-bakery:members", "rita.rewards@gmail.com"],
    ["RPUSH", "reb:rewards:bravo-bakery:txns:rita.rewards@gmail.com", JSON.stringify({ id: "tx_1", type: "earn", amount: 100, reason: "Bought bread for Rita Rewards", timestamp: new Date(now).toISOString() })],
    ["SET", "account-of:alpha-studio", "aaaaaaaa-0000-4000-8000-000000000001"],
    ["SET", "account-of:bravo-bakery", "aaaaaaaa-0000-4000-8000-000000000001"],
    ["SET", "account:aaaaaaaa-0000-4000-8000-000000000001", JSON.stringify({ id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Lakeside Group", primaryContactName: "Jane Owner", primaryContactEmail: "jane.owner@gmail.com", phone: "716-882-4417", tenantIds: ["alpha-studio", "bravo-bakery"], stripeCustomerId: "cus_AcctQ1w2E3r4T5y6", notes: "Prefers calls after 5", status: "active", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() })],
    ["SADD", "accounts:index", "aaaaaaaa-0000-4000-8000-000000000001", "unrelated-account"],
    ["SET", "threads:alpha-studio:t1", JSON.stringify({ messages: ["threads-secret-conversation with Pat Visitor"] })],
    ["SET", "crm:alpha-studio", JSON.stringify({ note: "Jane Owner is a referral" })],
    ["SET", "reb:paylink:xyz", JSON.stringify({ email: "jane.owner@gmail.com" })],
    ["SET", "lead:charlie-closed:lead_c1", lead("lead_c1", "Carl Closed", "carl.closed@aol.com", "old", "716-884-6631")],
  ];
  for (const command of commands) await client.call(command);
}

async function sourceFingerprint(target: PsqlTarget, redisSocket: string): Promise<string> {
  const tables = ["auth.users", "public.users", "public.tenants", "public.memberships", "public.content", "public.bookings", "public.accounts", "public.super_admins", "public.workspaces"];
  const pg = await psql(target, tables.map((table) => `SELECT md5(coalesce(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text), '')) FROM ${table} t;`).join("\n"));
  const client = await RespClient.connect(redisSocket);
  const keys = (await client.call(["KEYS", "*"]) as string[]).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const type = (await client.call(["TYPE", key]) as { simple: string }).simple;
    const value = type === "string" ? await client.call(["GET", key]) : type === "zset" ? await client.call(["ZRANGE", key, 0, -1, "WITHSCORES"]) : type === "set" ? (await client.call(["SMEMBERS", key]) as string[]).sort() : await client.call(["LRANGE", key, 0, -1]);
    parts.push(`${key}=${JSON.stringify(value)}`);
  }
  client.close();
  return createHash("sha256").update(pg + parts.join("\n")).digest("hex");
}

function textFiles(dir: string): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) {
      if (entry === "data") continue; // Postgres data files are checked through SQL below
      out.push(...textFiles(file));
    } else if (/\.(json|jsonl|env|log)$/.test(entry) || entry === "dump.rdb") {
      out.push({ name: path.relative(dir, file), text: readFileSync(file, "latin1") });
    }
  }
  return out;
}

function expectNoOriginals(label: string, text: string): void {
  const lower = text.toLowerCase();
  for (const original of ORIGINALS) expect(lower.includes(original.toLowerCase()), `${label} still contains an original value (${original.slice(0, 4)}...)`).toBe(false);
}

const hooks: CopyHooks = {
  documentHash: (document) => siteDocumentHash(document as SiteDocument),
  leadHash: (lead) => leadSubmissionHash({ id: "", createdAt: "", ...lead }),
  projectDevFiles,
};

describe.skipIf(!ENABLED)("scrubbed production copy end to end (local fake source)", () => {
  let root = "";
  let sourceData = "";
  let sourceSocket = "";
  let sourcePort = 0;
  let sourceTarget: PsqlTarget;
  let redis: LocalRedis;
  let bridge: UpstashBridge;
  let env: Record<string, string>;
  let manifest: CopyManifest;
  let before = "";
  const saltFile = () => path.join(root, "salt");

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "strelva-scrubbed-e2e."));
    sourceData = path.join(root, "source-pg");
    sourceSocket = mkdtempSync("/tmp/sc-src.");
    sourcePort = 62000 + Math.floor(Math.random() * 2000);
    await initCluster(sourceData);
    const started = await run("pg_ctl", ["-D", sourceData, "-l", path.join(root, "source-pg.log"), "-o", `-F -k '${sourceSocket}' -c listen_addresses='127.0.0.1' -p ${sourcePort}`, "-w", "start"]);
    expect(started.code).toBe(0);
    const user = (await run("id", ["-un"])).stdout.trim();
    sourceTarget = socketTarget(sourceSocket, sourcePort, user);
    await psqlFile(sourceTarget, path.join(repoRoot, "scripts/sql/local-supabase-shim.sql"));
    await psql(sourceTarget, "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text);");
    for (const migration of repoMigrations(repoRoot).filter((item) => item.version <= PRODUCTION_LEVEL)) {
      await psqlFile(sourceTarget, migration.file);
      await psql(sourceTarget, `insert into supabase_migrations.schema_migrations(version, name) values ('${migration.version}', '${path.basename(migration.file, ".sql").slice(15)}');`);
    }
    await psql(sourceTarget, SEED_SQL);

    const redisDir = path.join(root, "source-redis");
    rmSync(redisDir, { recursive: true, force: true });
    (await import("node:fs")).mkdirSync(redisDir);
    redis = await startLocalRedis(redisDir, path.join(mkdtempSync("/tmp/sc-rs."), "redis.sock"));
    const client = await RespClient.connect(redis.socket);
    await seedRedis(client);
    client.close();
    bridge = await startUpstashBridge({ socket: redis.socket, token: randomBytes(16).toString("hex") });
    before = await sourceFingerprint(sourceTarget, redis.socket);
    env = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      SCRUBBED_COPY_SOURCE_DATABASE_URL: `postgresql://${user}@127.0.0.1:${sourcePort}/postgres`,
      SCRUBBED_COPY_SOURCE_REDIS_REST_URL: bridge.url,
      SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN: bridge.token,
    };
  }, 300_000);

  afterAll(async () => {
    await bridge?.close();
    await redis?.stop(false);
    if (sourceData) await run("pg_ctl", ["-D", sourceData, "-m", "fast", "-w", "stop"]);
    if (root && process.env.SCRUBBED_COPY_E2E_KEEP !== "1") rmSync(root, { recursive: true, force: true });
    if (sourceSocket) rmSync(sourceSocket, { recursive: true, force: true });
  });

  const create = (out: string) => createCopy({
    out, source: "127.0.0.1", sourceRedis: "127.0.0.1", confirmed: true, skipRedis: false, includeInactive: false, replace: false,
    saltFile: saltFile(), repoRoot, env, grandfathered: "bravo-bakery",
  }, hooks);

  it("copies the active tenants, scrubbed, at the production schema level plus pending migrations", async () => {
    manifest = await create(path.join(root, "copy"));
    expect(manifest.tenants.map((tenant) => tenant.slug)).toEqual(["alpha-studio", "bravo-bakery"]);
    expect(manifest.schema.appliedAfterLoad).toEqual(expect.arrayContaining(["20261002120000_business_record.sql", "20261005090000_tenant_leads.sql"]));
    expect(manifest.schema.sourceOnlyMigrations).toEqual([]);
    expect(manifest.postgres.tablesAbsentInSource).toEqual(expect.arrayContaining(["public.tenant_leads", "public.website_documents"]));
    expect(manifest.postgres.foreignKeyOrphans).toEqual({});
    expect(manifest.postgres.tables["public.tenants"]).toBe(2);
    expect(manifest.postgres.tables["public.bookings"]).toBe(1);
    expect(manifest.postgres.tables["auth.users"]).toBe(4);
    expect(manifest.redis?.keys).toMatchObject({ lead: 2, "leads-index": 1, connections: 1, event: 1, account: 1, "accounts-index": 1, rewards: 3, order: 1 });
    expect(manifest.redis?.keysLeftOut).toMatchObject({ "left-out:threads:{t}:*": 1, "left-out:crm:{t}": 1 });
    expect(manifest.redis?.keysUnclassified).toBe(2); // the pay link and the inactive tenant's lead
    const alpha = manifest.tenants.find((tenant) => tenant.slug === "alpha-studio")!;
    expect(alpha.postgresRows).toMatchObject({ "public.tenants": 1, "public.content": 4, "public.bookings": 1, "public.memberships": 1, "public.domain_claims": 1 });
    expect(alpha.redisKeys).toMatchObject({ lead: 2, connections: 1, "booking-config": 1 });
    expect(manifest.leakCheck.passed).toBe(true);
    expect(manifest.leakCheck.emailsChecked).toBeGreaterThan(5);
    expectNoOriginals("manifest", readFileSync(path.join(root, "copy", "manifest.json"), "utf8"));
  }, 300_000);

  it("leaves no original email, phone, name or secret in any file, the database or Redis, and keeps joins", async () => {
    const out = path.join(root, "copy");
    for (const file of textFiles(out)) expectNoOriginals(file.name, file.text);
    const running = await startCopy(out, { env });
    try {
      const target = running.target!;
      const dump = await psql(target, `SELECT string_agg(row_to_json(t)::text, E'\\n') FROM (
        SELECT * FROM public.tenants) t;
        SELECT json_agg(t) FROM public.users t; SELECT json_agg(t) FROM auth.users t; SELECT json_agg(t) FROM public.accounts t;
        SELECT json_agg(t) FROM public.content t; SELECT json_agg(t) FROM public.bookings t; SELECT json_agg(t) FROM public.subscriptions t;
        SELECT json_agg(t) FROM public.workspaces t; SELECT json_agg(t) FROM public.super_admins t;`);
      expectNoOriginals("local postgres", dump);
      const joins = (await psql(target, `SELECT json_build_object(
        'ownerIsUser', (SELECT count(*) FROM public.tenants t JOIN public.users u ON u.email = t.owner_email WHERE t.id = 'alpha-studio'),
        'adminIsUser', (SELECT count(*) FROM public.super_admins s JOIN public.users u ON u.id = s.user_id AND u.email = s.email),
        'authMatches', (SELECT count(*) FROM auth.users a JOIN public.users u ON u.id = a.id AND u.email = a.email),
        'stripeJoin', (SELECT count(*) FROM public.subscriptions s JOIN public.accounts a ON a.stripe_customer_id = s.stripe_customer_id),
        'memberships', (SELECT count(*) FROM public.memberships m JOIN public.users u ON u.id = m.user_id JOIN public.tenants t ON t.id = m.tenant_id),
        'pendingTables', (SELECT count(*) FROM pg_class WHERE relname IN ('tenant_leads','business_records','tenant_workspace_links')));`)).trim();
      expect(JSON.parse(joins)).toEqual({ ownerIsUser: 1, adminIsUser: 2, authMatches: 5, stripeJoin: 1, memberships: 2, pendingTables: 3 });

      const app = new Redis({ url: running.bridge!.url, token: running.bridge!.token });
      const ids = await app.zrange<string[]>("leads:alpha-studio", 0, -1, { rev: true });
      expect(ids).toEqual(["lead_a2", "lead_a1"]);
      const lead = await app.get<{ name: string; email: string; fields: { phone: string } }>("lead:alpha-studio:lead_a1");
      expect(lead?.email).toMatch(/@scrubbed\.strelva\.test$/);
      const keys = (await app.keys("*")).sort();
      expect(keys.some((key) => key.startsWith("reb:rewards:bravo-bakery:member:u") && key.endsWith("@scrubbed.strelva.test"))).toBe(true);
      expect(keys).not.toContain("threads:alpha-studio:t1");
      expect(keys).not.toContain("reb:paylink:xyz");
      const values: string[] = [];
      for (const key of keys) {
        const type = await app.type(key);
        values.push(key, JSON.stringify(type === "string" ? await app.get(key) : type === "zset" ? await app.zrange(key, 0, -1) : type === "set" ? await app.smembers(key) : await app.lrange(key, 0, -1)));
      }
      expectNoOriginals("local redis", values.join("\n"));
      const connection = await app.get<{ accessToken: string; status: string }>("connections:alpha-studio:google");
      expect(connection).toMatchObject({ accessToken: "scrubbed-secret", status: "connected" });
      await expect(app.eval("return 1", [], [])).resolves.toBe(1);
      await expect(new Redis({ url: running.bridge!.url, token: "wrong" }).get("x")).rejects.toThrow();
    } finally {
      await running.stop();
    }
  }, 300_000);

  it("never wrote to the source", async () => {
    expect(await sourceFingerprint(sourceTarget, redis.socket)).toBe(before);
  }, 60_000);

  it("is deterministic: a second copy from the same source and salt is identical", async () => {
    await create(path.join(root, "copy-2"));
    const scrubbed = (dir: string) => readdirSync(path.join(root, dir, "scrubbed")).sort().map((name) => {
      const text = readFileSync(path.join(root, dir, "scrubbed", name), "utf8");
      return name === "redis.jsonl" ? text.split("\n").filter(Boolean).map((line) => ({ ...JSON.parse(line), expireAtMs: null })) : text;
    });
    expect(scrubbed("copy-2")).toEqual(scrubbed("copy"));
    expect(readFileSync(path.join(root, "copy-2", "dev", "dev-tenants.json"), "utf8")).toBe(readFileSync(path.join(root, "copy", "dev", "dev-tenants.json"), "utf8"));
  }, 300_000);

  it("runs the conversion dry run for every active tenant and applies each plan in a rolled-back transaction", async () => {
    const report = await dryRunCopy(path.join(root, "copy"), { repoRoot, env, rehearse: true });
    expect(report.summary).toEqual({ tenants: 2, planned: 2, rehearsedOk: 2, failed: 0 });
    const alpha = report.tenants.find((entry) => entry.slug === "alpha-studio")!;
    expect(alpha.counts).toMatchObject({ services: 2, people: 1, leadsRead: 2, bookingsRead: 1 });
    expect(alpha.counts!.contacts).toBeGreaterThanOrEqual(2);
    expect(alpha.rehearsal).toMatchObject({ applied: true, receipt: { alreadyConverted: false } });
    const bravo = report.tenants.find((entry) => entry.slug === "bravo-bakery")!;
    expect(bravo.counts).toMatchObject({ people: 0, leadsRead: 0 });
    expect(bravo.skippedFields).toContain("tenant.ownerName");
    expectNoOriginals("dry-run report", readFileSync(path.join(root, "copy", "dry-run-report.json"), "utf8"));
    // Rolled back: the copy has no business workspace afterwards.
    const running = await startCopy(path.join(root, "copy"), { env });
    try {
      expect((await psql(running.target!, "SELECT count(*) FROM public.tenant_workspace_links;")).trim()).toBe("0");
    } finally {
      await running.stop();
    }
  }, 300_000);

  it("refuses a rehearsal it cannot run instead of reporting zero failures", async () => {
    // A copy loaded with --dest-database-url keeps no database the dry run can reach.
    const statePath = path.join(root, "copy", "state.json");
    const original = readFileSync(statePath, "utf8");
    writeFileSync(statePath, JSON.stringify({ ...JSON.parse(original), managedCluster: false }), { mode: 0o600 });
    try {
      await expect(dryRunCopy(path.join(root, "copy"), { repoRoot, env, rehearse: true })).rejects.toThrow(/no database the dry run can reach/);
      const planOnly = await dryRunCopy(path.join(root, "copy"), { repoRoot, env, rehearse: false });
      expect(planOnly.summary).toEqual({ tenants: 2, planned: 2, rehearsedOk: 0, failed: 0 });
    } finally {
      writeFileSync(statePath, original, { mode: 0o600 });
    }
  }, 300_000);

  it("refuses to rebuild over an existing copy without --replace, and refuses a re-enabled outbound switch", async () => {
    await expect(create(path.join(root, "copy"))).rejects.toThrow(/--replace/);
    const envFile = path.join(root, "copy-2", "copy.env");
    writeFileSync(envFile, readFileSync(envFile, "utf8").replace("STRIPE_SECRET_KEY=", "STRIPE_SECRET_KEY=sk_test_reenabled"));
    await expect(startCopy(path.join(root, "copy-2"), { env })).rejects.toThrow(/STRIPE_SECRET_KEY/);
    expect(existsSync(path.join(root, "copy", "manifest.json"))).toBe(true);
  }, 60_000);
});
