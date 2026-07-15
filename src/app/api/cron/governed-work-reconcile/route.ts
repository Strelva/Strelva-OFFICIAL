import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { reconcileGovernedWork } from "@/lib/governed-work/reconcile";
import { requireCronRequest } from "@/lib/cron-auth";

// Iterates every tenant's governed events — cap at the platform ceiling so it
// can't die mid-sweep as tenant count grows.
export const maxDuration = 300;

/**
 * Durability sweep: re-assert that every governed event in Redis has a current
 * Postgres proposal row (see src/lib/governed-work/reconcile.ts). Drift (rows it
 * had to insert/update) means the live dual-write shadow is missing writes — alert.
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const r = await reconcileGovernedWork();
  // Drift = a MISSING proposal the live shadow failed to write (the durability
  // signal). change_request `updated`s are routine idempotent re-syncs, not drift.
  const drift = r.inserted;

  if ((drift > 0 || r.errors.length > 0) && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Governed-work reconcile: ${r.inserted} missing rows recovered across ${r.governed} governed events — the live shadow is dropping writes${r.errors.length ? `; ${r.errors.length} errors: ${r.errors.slice(0, 3).join("; ")}` : ""}`,
      }),
    }).catch(() => {});
  }

  await recordHeartbeat("governed-work-reconcile", { ok: r.errors.length === 0, processed: r.governed, failed: drift });

  return NextResponse.json(r, { status: r.errors.length && r.errors.length === r.tenants ? 500 : 200 });
}
