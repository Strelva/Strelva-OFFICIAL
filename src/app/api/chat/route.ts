import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { loadChatMessages, saveChatMessages } from "@/lib/storage";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const messages = await loadChatMessages("default");
    return NextResponse.json(messages);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const messages = await req.json();
    await saveChatMessages("default", messages);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save messages" }, { status: 500 });
  }
}
