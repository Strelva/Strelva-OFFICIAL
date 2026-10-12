import { NextResponse } from "next/server";
import { ghlImportReleaseEnabled, receiveGhlWebhook } from "@/products/agency-clients/gohighlevel";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64_000;

/**
 * HighLevel app deliveries (AppInstall, AppUninstall, LocationCreate). The
 * signature over the raw body is the only authentication. A delivery is a
 * hint that a client may be waiting to import; it never adds one.
 */
export async function POST(request: Request) {
  if (!ghlImportReleaseEnabled()) return NextResponse.json({ error: "Not enabled." }, { status: 503 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  try {
    const outcome = await receiveGhlWebhook(raw, request.headers);
    return NextResponse.json({ result: outcome.result }, { status: outcome.status });
  } catch {
    // Not recorded: let HighLevel retry.
    return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  }
}
