import { NextResponse } from "next/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { readBoundedBody } from "@/platform/workspaces/http";
import { inquiryBookingHandoffEnabled, chooseInquiryBookingSlot } from "@/products/inquiries";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!inquiryBookingHandoffEnabled()) return new NextResponse("Not found", { status: 404 });
  const { token } = await params;
  const page = new URL(`/inquiry-booking/${encodeURIComponent(token)}`, request.url);
  page.host = request.headers.get("host") ?? page.host;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== page.host) return new NextResponse("Forbidden", { status: 403 });
    } catch { return new NextResponse("Forbidden", { status: 403 }); }
  }
  if (await isRateLimitedAsync(rateLimitKey(request, "inquiry-booking"), 10)) {
    page.searchParams.set("error", "rate");
    return new NextResponse(null, { status: 303, headers: { Location: page.toString() } });
  }
  try {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") throw new Error("invalid");
    const form = new URLSearchParams((await readBoundedBody(request, 2048)).toString("utf8"));
    const index = form.get("slot");
    if (form.getAll("slot").length !== 1) throw new Error("invalid");
    if (typeof index !== "string" || !/^[0-2]$/.test(index)) throw new Error("invalid");
    await chooseInquiryBookingSlot(token, Number(index));
  } catch {
    page.searchParams.set("error", "unavailable");
  }
  return new NextResponse(null, { status: 303, headers: { Location: page.toString() } });
}
