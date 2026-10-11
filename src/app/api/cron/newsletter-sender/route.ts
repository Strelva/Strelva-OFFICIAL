import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { newsletterSenderEnabled, sendApprovedNewsletterIssues } from "@/products/publishing/server";

export const maxDuration = 300;
export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireCronRequest(request);
  if (denied) return denied;
  if (!newsletterSenderEnabled()) {
    await recordHeartbeat("newsletter-sender", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled" });
  }
  try {
    const summary = await sendApprovedNewsletterIssues();
    await recordHeartbeat("newsletter-sender", { ok: summary.failed + summary.unknown === 0, processed: summary.accepted, failed: summary.failed + summary.unknown });
    return NextResponse.json(summary);
  } catch {
    await recordHeartbeat("newsletter-sender", { ok: false, failed: 1 });
    return NextResponse.json({ error: "Newsletter sender failed." }, { status: 500 });
  }
}
