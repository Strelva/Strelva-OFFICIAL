import { NextResponse } from "next/server";
import { isRateLimitedWindowedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { readJsonObject } from "@/lib/request-body";

export async function POST(req: Request) {
  if (await isRateLimitedWindowedAsync(rateLimitKey(req, "access-request-intake"), 5, 3600_000)) {
    return NextResponse.json({ error: "Too many submissions" }, { status: 429 });
  }
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  // Account access never grants consent to sales or chooses an agency.
  if (body.requestType === "business_access" || body.requestType === "agency_access") {
    return NextResponse.json({ success: true, requestType: body.requestType,
      next: body.requestType === "agency_access" ? "/sign-up?as=agency" : "/sign-up" });
  }
  if (body.requestType === "agency_service") {
    // Agency work uses the signed-in, explicitly selected proposal path. Keep
    // the historical public route from privately assigning leads to an agency.
    return NextResponse.json({
      error: "Choose an agency from the directory, then sign in to send your request. No request was sent.",
      next: "/agencies", signIn: "/sign-up",
    }, { status: 409 });
  }
  return NextResponse.json({ error: "Choose business access, agency access, or an agency from the directory." }, { status: 400 });
}
