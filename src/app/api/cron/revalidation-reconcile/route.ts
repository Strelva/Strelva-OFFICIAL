import { NextResponse } from "next/server";
import { reconcileRevalidations } from "@/lib/revalidate-client";

export async function GET() {
  const results = await reconcileRevalidations();

  const revalidated = results.filter((r) => r.action === "revalidated");
  const failed = results.filter((r) => r.action === "failed");

  if (failed.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Revalidation reconciliation: ${revalidated.length} re-synced, ${failed.length} failed — ${failed.map((f) => `${f.tenantId}: ${f.error}`).join(", ")}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    total: results.length,
    revalidated: revalidated.length,
    failed: failed.length,
    upToDate: results.filter((r) => r.action === "up_to_date").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    results,
  });
}
