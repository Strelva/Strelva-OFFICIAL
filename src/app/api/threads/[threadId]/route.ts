import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { getThread, updateThread, deleteThread, ChatMessage } from "@/lib/threads";
import { readJsonObject } from "@/lib/request-body";

/**
 * GET /api/threads/[threadId] - Get a single thread
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const thread = await getThread(tenant, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json(thread);
  } catch (err) {
    console.error("[threads GET one]", threadId, err);
    return NextResponse.json({ error: "Failed to get thread" }, { status: 500 });
  }
}

/**
 * PATCH /api/threads/[threadId] - Update a thread
 * Body: { title?: string, messages?: ChatMessage[] }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updates: { title?: string; messages?: ChatMessage[] } = {};

    if (typeof body.title === "string") {
      updates.title = body.title;
    }
    if (Array.isArray(body.messages)) {
      updates.messages = body.messages as ChatMessage[];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    const thread = await updateThread(tenant, threadId, updates);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json(thread);
  } catch (err) {
    console.error("[threads PATCH]", threadId, err);
    return NextResponse.json({ error: "Failed to update thread" }, { status: 500 });
  }
}

/**
 * DELETE /api/threads/[threadId] - Delete a thread
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    // Check if thread exists before deleting
    const existing = await getThread(tenant, threadId);
    if (!existing) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    await deleteThread(tenant, threadId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[threads DELETE]", threadId, err);
    return NextResponse.json({ error: "Failed to delete thread" }, { status: 500 });
  }
}
