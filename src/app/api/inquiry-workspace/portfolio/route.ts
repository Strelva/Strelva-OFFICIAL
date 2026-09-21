import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { inquiryReleaseEnabled } from "@/products/inquiries";
import { discoverInquiryPortfolio } from "@/products/inquiries";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (!inquiryReleaseEnabled()) return NextResponse.json({ error: "Inquiries are not enabled." }, { status: 503, headers });
  if (!await verifyAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try { return NextResponse.json(await discoverInquiryPortfolio(), { headers }); }
  catch { return NextResponse.json({ error: "Your businesses could not be loaded." }, { status: 503, headers }); }
}
