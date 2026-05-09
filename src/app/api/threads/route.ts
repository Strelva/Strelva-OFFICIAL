import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { listThreads, createThread } from "@/lib/threads";
import { readOptionalJsonObject } from "@/lib/request-body";

/**
 * GET /api/threads - List all threads for the tenant
 */
export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const threads = await listThreads(tenant);
    return NextResponse.json(threads);
  } catch (err) {
    console.error("[threads GET]", err);
    return NextResponse.json({ error: "Failed to list threads" }, { status: 500 });
  }
}

/**
 * POST /api/threads - Create a new thread
 * Body: { title?: string }
 */
export async function POST(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const body = await readOptionalJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const title = typeof body?.title === "string" ? body.title : undefined;

    const thread = await createThread(tenant, title);
    return NextResponse.json(thread, { status: 201 });
  } catch (err) {
    console.error("[threads POST]", err);
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }
}
