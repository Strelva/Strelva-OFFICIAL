import { NextResponse } from "next/server";

import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { inquiryReleaseEnabled } from "@/products/inquiries/server";
import { runDueInquiryFollowUps } from "@/products/inquiries";

export const maxDuration = 300;

/**
 * Due inquiry delivery executor. A missing reply-state adapter blocks customer
 * follow-up inside the delivery connector, so this route never infers "no
 * reply" from the lead list; published staff routing remains separately
 * governed by the same delivery boundary.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  if (!inquiryReleaseEnabled()) {
    await recordHeartbeat("inquiry-follow-ups", { ok: true, processed: 0 });
    return NextResponse.json({ status: "disabled", ranAt: new Date().toISOString() });
  }

  try {
    const result = await runDueInquiryFollowUps();
    await recordHeartbeat("inquiry-follow-ups", {
      ok: result.failed === 0,
      processed: result.attempted,
      failed: result.failed,
    });
    return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
  } catch (error) {
    console.error("[cron inquiry-follow-ups] failed", error instanceof Error ? error.message : String(error));
    await recordHeartbeat("inquiry-follow-ups", { ok: false, failed: 1 });
    return NextResponse.json({ error: "Inquiry follow-up sweep failed." }, { status: 500 });
  }
}
