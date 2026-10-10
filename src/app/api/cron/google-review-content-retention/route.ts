import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { purgeGoogleReviewContent } from "@/lib/google-review-content-retention";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
export const maxDuration = 60;
export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireCronRequest(request);
  if (denied) return denied;
  try {
    const result = await purgeGoogleReviewContent();
    await recordHeartbeat("google-review-content-retention", { ok: true, processed: result.reviews + result.events + result.devFiles + result.archiveParts });
    return NextResponse.json(result);
  } catch {
    await recordHeartbeat("google-review-content-retention", { ok: false, processed: 0, failed: 1 });
    return NextResponse.json({ error: "Google review content retention must be retried." }, { status: 503 });
  }
}
