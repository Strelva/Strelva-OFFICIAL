/**
 * One-shot migration: GLDF signed rewards endpoint → REB Upstash KV.
 *
 * Pulls every member from GLDF via the existing Phase 10 signed proxy, then
 * writes each one (plus transactions) into REB's tenant-scoped KV. Idempotent:
 * skips members that already exist in REB KV, so it's safe to re-run.
 *
 * Required env vars (all four):
 *   GLDF_INTERNAL_URL          — e.g. https://goodlookingfoods.com
 *   REWARDS_PROXY_SECRET       — same shared secret GLDF expects
 *   UPSTASH_REDIS_REST_URL     — REB's Upstash endpoint
 *   UPSTASH_REDIS_REST_TOKEN   — REB's Upstash REST token
 *
 * Run:
 *   cd /Users/laneyfraass/reb && pnpm exec tsx scripts/migrate-rewards-from-gldf.ts gldf
 *
 * The positional arg is the tenant id to write under (defaults to "gldf").
 */

import {
  getKv,
  KvNotConfiguredError,
} from "../src/lib/rewards/kv";
import {
  getMember as kvGetMember,
  saveMember as kvSaveMember,
  logTransaction as kvLogTransaction,
  getTransactions as kvGetTransactions,
} from "../src/lib/rewards/memberRepositoryKv";
import type { Member, StarsTransaction } from "../src/lib/rewards/types";

type ListResponse = { members: Member[] };
type DetailResponse = { member: Member; transactions: StarsTransaction[] };

async function fetchJson<T>(url: string, auth: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: auth },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GLDF ${url} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function main() {
  const tenant = process.argv[2] || "gldf";

  const base = process.env.GLDF_INTERNAL_URL;
  const secret = process.env.REWARDS_PROXY_SECRET;
  if (!base || !secret) {
    console.error(
      "missing GLDF_INTERNAL_URL or REWARDS_PROXY_SECRET — cannot read from GLDF"
    );
    process.exit(1);
  }

  if (!getKv()) {
    console.error(
      "missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN — cannot write to REB KV"
    );
    process.exit(1);
  }

  const auth = `Bearer ${secret}`;
  console.log(`[migrate] tenant=${tenant} source=${base}`);

  const list = await fetchJson<ListResponse>(
    `${base}/api/admin/rewards/members`,
    auth
  );
  console.log(`[migrate] fetched ${list.members.length} members from GLDF`);

  let imported = 0;
  let skipped = 0;
  let txnsWritten = 0;

  for (const stub of list.members) {
    const email = stub.email.trim().toLowerCase();

    // Idempotence: skip if already present in REB KV.
    const existing = await kvGetMember(tenant, email);
    if (existing) {
      skipped++;
      continue;
    }

    let detail: DetailResponse;
    try {
      detail = await fetchJson<DetailResponse>(
        `${base}/api/admin/rewards/members?email=${encodeURIComponent(email)}`,
        auth
      );
    } catch (err) {
      console.warn(`[migrate] skip ${email} — detail fetch failed:`, err);
      continue;
    }

    await kvSaveMember(tenant, detail.member);

    // Only write transactions if the REB list is currently empty — cheap
    // protection against doubling up on re-run.
    const currentTxns = await kvGetTransactions(tenant, email, 1);
    if (currentTxns.length === 0) {
      // Oldest first so lpush order ends up newest-first in KV.
      const ordered = [...detail.transactions].reverse();
      for (const txn of ordered) {
        await kvLogTransaction(tenant, email, txn.type, txn.amount, txn.reason);
        txnsWritten++;
      }
    }

    imported++;
    if (imported % 25 === 0) console.log(`[migrate] ${imported} imported...`);
  }

  console.log(
    `[migrate] done. imported=${imported} skipped=${skipped} transactions=${txnsWritten}`
  );
}

main().catch((err) => {
  if (err instanceof KvNotConfiguredError) {
    console.error("[migrate] KV not configured");
  } else {
    console.error("[migrate] failed:", err);
  }
  process.exit(1);
});
