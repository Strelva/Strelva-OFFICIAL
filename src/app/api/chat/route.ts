import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth";
import { loadChatMessages, saveChatMessages } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonArray } from "@/lib/request-body";

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const messages = await loadChatMessages("default", tenant);
    return NextResponse.json(messages);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const messages = await readJsonArray(req);
    if (!messages) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    await saveChatMessages("default", messages, tenant);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save messages" }, { status: 500 });
  }
}
