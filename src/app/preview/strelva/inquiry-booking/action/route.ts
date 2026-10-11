import { NextResponse } from "next/server";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
export async function POST(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new NextResponse("Not found", { status: 404 });
  const slot = (await request.formData()).get("slot");
  const url = new URL("/preview/strelva/inquiry-booking", request.url);
  url.host = request.headers.get("host") ?? url.host;
  url.searchParams.set("state", "requested");
  if (typeof slot === "string" && /^[0-2]$/.test(slot)) url.searchParams.set("slot", slot);
  return new NextResponse(null, { status: 303, headers: { Location: url.toString() } });
}
