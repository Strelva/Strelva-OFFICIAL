#!/usr/bin/env npx tsx
/**
 * Activation snapshot: per active tenant, is Google connected and is analytics
 * configured. Reads RAW Redis (connection status + analytics:cfg are plaintext;
 * only OAuth tokens are encrypted) and a raw tenant-id select, so it needs NO
 * SECRETS_ENC_KEY and never decrypts.
 *
 * Run: npx tsx --env-file=.env.local scripts/check-activation-state.ts
 */
import { getSupabase } from "../src/lib/db/client";
import { getRedis } from "../src/lib/redis";

async function main() {
  const db = getSupabase();
  const redis = getRedis();
  if (!db || !redis) throw new Error("db/redis not configured (env not loaded?)");

  const { data, error } = await db.from("tenants").select("id, active");
  if (error) throw error;
  const tenants = (data ?? []).filter((t: { active?: boolean }) => t.active !== false) as Array<{ id: string }>;
  console.log(`Active tenants: ${tenants.length}\n`);
  console.log("tenant".padEnd(22), "google", "gsc-cfg", "ga4-cfg");
  console.log("-".repeat(50));

  let googleConnected = 0;
  for (const t of tenants) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gConn = (await redis.get(`connections:${t.id}:google`).catch(() => null)) as any;
    const google = gConn && gConn.status === "connected";
    if (google) googleConnected++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = (await redis.get(`analytics:cfg:${t.id}`).catch(() => null)) as any;
    const gscCfg = cfg?.searchConsoleProperty || cfg?.scProperty || cfg?.gscProperty || cfg?.property;
    const ga4Cfg = cfg?.ga4PropertyId || cfg?.ga4Property;
    console.log(
      t.id.padEnd(22),
      (google ? "YES" : "no").padEnd(6),
      (gscCfg ? "set" : "-").padEnd(7),
      ga4Cfg ? "set" : "-",
    );
  }
  console.log(`\n${googleConnected}/${tenants.length} tenants have Google connected.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
