import { NextResponse } from "next/server";
import { reconcileRevalidations } from "@/lib/revalidate-client";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await reconcileRevalidations();

  const revalidatedCount = results.filter((r) => r.action === "revalidated").length;
  const failedCount = results.filter((r) => r.action === "failed").length;
  const skippedCount = results.filter((r) => r.action === "skipped").length;
  const upToDateCount = results.filter((r) => r.action === "up_to_date").length;

  if (failedCount > 0 && process.env.SLACK_WEBHOOK_URL) {
    const failed = results.filter((r) => r.action === "failed");
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Revalidation reconciliation: ${revalidatedCount} re-synced, ${failedCount} failed — ${failed.map((f) => `${f.tenantId}: ${f.error}`).join(", ")}`,
      }),
    }).catch(() => {});
  }

  const status = failedCount === results.length && results.length > 0 ? 500 : 200;

  return NextResponse.json({
    total: results.length,
    revalidated: revalidatedCount,
    failed: failedCount,
    skipped: skippedCount,
    up_to_date: upToDateCount,
  }, { status });
}
