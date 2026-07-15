#!/usr/bin/env npx tsx
/**
 * Integration proof for renameTenantSlug against REAL prod Redis + DB, on a
 * throwaway tenant. Seeds one key per authoritative store, renames, asserts every
 * key moved (+ event blob rewritten), then cleans up. NOT a migration/test file —
 * run manually: npx tsx --env-file=.env.local scripts/verify-tenant-rename.ts
 */
import { getRedis } from "../src/lib/redis";
import { getSupabase } from "../src/lib/db/client";
import { renameTenantSlug } from "../src/lib/tenant-rename";

const A = "zzcaudit-ren-a";
const B = "zzcaudit-ren-b";

async function main() {
  const redis = getRedis();
  const db = getSupabase();
  if (!redis || !db) throw new Error("redis/db not configured");

  // cleanup any prior run
  await db.from("tenants").delete().in("id", [A, B]);

  // seed DB tenant + a child row (proves the FK cascade too)
  await db.from("tenants").insert({ id: A, site_name: "rename verify" });
  await db.from("newsletter_subscribers").insert({ tenant_id: A, email: "child@example.invalid" });

  // seed one Redis key per authoritative store (values carry an embedded tenant
  // field where the real store would, to prove the blob rewrite)
  const seeded: Record<string, unknown> = {
    [`connections:${A}:google`]: { provider: "google", accessToken: "tok", tenantId: A },
    [`crm:${A}`]: { stage: "live", tenant: A },
    [`reb:crm-lock:${A}`]: "1",
    [`leads:${A}`]: ["lead1"],
    [`lead:${A}:lead1`]: { email: "c@x.com", tenant: A },
    [`orders:${A}`]: ["ord1"],
    [`order:${A}:ord1`]: { amount: 50, tenant: A },
    [`reb:reply-voice:${A}`]: "auto",
    [`reb:rewards:${A}:members`]: ["m1"],
    [`reb:booking:config:${A}`]: { provider: "internal" },
    [`reb:content-autonomy:${A}`]: "approve",
    [`reb:engagement:${A}:2026-07-15`]: 3,
    [`threads:${A}:index`]: ["t1"],
  };
  for (const [k, v] of Object.entries(seeded)) await redis.set(k, v);
  // event: zset member + id-keyed blob embedding tenantId
  await redis.set(`event:ev_ren_1`, { id: "ev_ren_1", tenantId: A, type: "review", title: "t", body: "b", status: "pending", createdAt: "2026-07-15T00:00:00Z", source: "google" });
  await redis.zadd(`events:${A}`, { score: 1, member: "ev_ren_1" });

  // RENAME
  const result = await renameTenantSlug(A, B);
  console.log("rename result:", JSON.stringify(result));

  // assertions
  const problems: string[] = [];
  // DB: tenant + child moved
  const { data: t } = await db.from("tenants").select("id").eq("id", B).maybeSingle();
  if (!t) problems.push("DB tenant not renamed to B");
  const { data: child } = await db.from("newsletter_subscribers").select("tenant_id").eq("email", "child@example.invalid").maybeSingle();
  if (child?.tenant_id !== B) problems.push(`child tenant_id=${child?.tenant_id} (want ${B})`);

  // Redis: every seeded key moved old→new, old gone
  for (const oldKey of Object.keys(seeded)) {
    const newKey = oldKey.split(":").map((s) => (s === A ? B : s)).join(":");
    const oldV = await redis.get(oldKey);
    const newV = await redis.get(newKey);
    if (oldV !== null) problems.push(`old key still present: ${oldKey}`);
    if (newV === null) problems.push(`new key missing: ${newKey}`);
  }
  // embedded tenant fields rewritten
  const conn = await redis.get<{ tenantId?: string }>(`connections:${B}:google`);
  if (conn?.tenantId !== B) problems.push(`connections blob tenantId=${conn?.tenantId}`);
  const lead = await redis.get<{ tenant?: string }>(`lead:${B}:lead1`);
  if (lead?.tenant !== B) problems.push(`lead blob tenant=${lead?.tenant}`);
  // event zset moved + blob rewritten
  const zNew = await redis.zrange(`events:${B}`, 0, -1);
  if (!Array.isArray(zNew) || zNew.length !== 1) problems.push(`events:${B} zset=${JSON.stringify(zNew)}`);
  const zOld = await redis.zrange(`events:${A}`, 0, -1);
  if (Array.isArray(zOld) && zOld.length) problems.push(`events:${A} still has members`);
  const evBlob = await redis.get<{ tenantId?: string }>(`event:ev_ren_1`);
  if (evBlob?.tenantId !== B) problems.push(`event blob tenantId=${evBlob?.tenantId}`);

  console.log(problems.length === 0 ? "\n✅ ALL ASSERTIONS PASSED — rename moved DB + every authoritative Redis store" : "\n❌ PROBLEMS:\n  " + problems.join("\n  "));

  // cleanup: DB (cascades child) + any residual Redis keys under A or B
  await db.from("tenants").delete().in("id", [A, B]);
  for (const slug of [A, B]) {
    for (const k of [...Object.keys(seeded).map((x) => x.split(":").map((s) => (s === A ? slug : s)).join(":")), `events:${slug}`]) await redis.del(k);
  }
  await redis.del(`event:ev_ren_1`);
  process.exit(problems.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
