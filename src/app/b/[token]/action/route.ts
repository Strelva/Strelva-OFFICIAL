import { NextResponse } from "next/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { bookingManagePageEnabled } from "@/platform/bookings/flags";
import { actOnManageLink } from "@/platform/bookings/manage";
import { manageDeps } from "@/platform/bookings/manage-server";

export const dynamic = "force-dynamic";

/**
 * The manage page's two actions, change time and cancel, as plain form posts.
 * The token in the path is the authorization; the public booking service's
 * own change and cancel run. Always answers with a redirect back to the page
 * (303), which shows the outcome.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  if (!bookingManagePageEnabled()) return new NextResponse("Not found", { status: 404 });
  const { token } = await params;
  const page = new URL(`/b/${encodeURIComponent(token)}`, request.url);
  if (await isRateLimitedAsync(rateLimitKey(request, "booking-manage"), 10)) {
    page.searchParams.set("error", "rate");
    return NextResponse.redirect(page, 303);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    page.searchParams.set("error", "invalid");
    return NextResponse.redirect(page, 303);
  }
  const value = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : null;
  };
  const result = await actOnManageLink(token, { action: value("action"), slotId: value("slotId") }, manageDeps());
  if ("done" in result) page.searchParams.set("done", result.done);
  else page.searchParams.set("error", result.error);
  return NextResponse.redirect(page, 303);
}
