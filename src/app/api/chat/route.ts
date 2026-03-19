import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { loadChatMessages, saveChatMessages } from "@/lib/storage";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await loadChatMessages("default");
  return NextResponse.json(messages);
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await req.json();
  await saveChatMessages("default", messages);
  return NextResponse.json({ success: true });
}
