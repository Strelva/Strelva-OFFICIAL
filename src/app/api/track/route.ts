import { NextResponse } from "next/server";
import { trackClick } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const { event } = await req.json();
    if (typeof event !== "string" || event.length > 50) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }
    await trackClick(event);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
