import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { loadChatMessages, saveChatMessages } from "@/lib/storage";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function verifyAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("rohlax-admin-token")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

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
