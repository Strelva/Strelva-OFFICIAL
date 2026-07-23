import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { buildAttentionBriefing } from "@/lib/attention";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

/**
 * Daily operator briefing to Slack: the prioritized "what needs attention"
 * digest from the portfolio brain. Auth via the proxy (CRON_SECRET). Stays
 * quiet when there's nothing high/medium to act on.
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  try {
    const briefing = await buildAttentionBriefing();
    const high = briefing.items.filter((i) => i.severity === "high");
    const medium = briefing.items.filter((i) => i.severity === "medium");

    if (process.env.SLACK_WEBHOOK_URL && (high.length > 0 || medium.length > 0)) {
      const lines = [
        `*Operator briefing* — ${briefing.counts.high} high · ${briefing.counts.medium} medium · ${briefing.counts.low} low`,
        ...high.slice(0, 12).map((i) => `🔴 ${i.message}`),
        ...medium.slice(0, 12).map((i) => `🟠 ${i.message}`),
      ];
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lines.join("\n") }),
      }).catch(() => {});
    }

    await recordHeartbeat("attention-digest", { ok: true });
    return NextResponse.json({ ok: true, counts: briefing.counts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron attention-digest] failed:", err);
    // Record a failed heartbeat so the watchdog surfaces a crash on the next
    // tick instead of showing the last success as fresh until the max-age window.
    await recordHeartbeat("attention-digest", { ok: false }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
