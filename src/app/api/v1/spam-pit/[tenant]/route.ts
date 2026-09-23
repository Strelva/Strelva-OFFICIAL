/**
 * Spam pit API (see src/lib/spam-pit.ts).
 *
 * POST: a client site's form function files a caught submission here instead
 *   of emailing anyone. Bearer SPAM_PIT_WRITE_KEY (lives in client repos).
 * GET:  operator reads a tenant's pit. Bearer SPAM_PIT_READ_KEY (never in a
 *   client repo), so a leaked write key cannot read anything back.
 * Both fail closed when their key is unset. Server-to-server only (no CORS).
 */
import { NextResponse } from "next/server";
import { validateCronRequest } from "@/lib/cron-auth";
import { readOptionalJsonObject } from "@/lib/request-body";
import { isTenantId } from "@/lib/scaffold-contracts";
import { getSpam, recordSpam } from "@/lib/spam-pit";

function authorized(key: string | undefined, req: Request): boolean {
  // Same constant-time bearer policy as cron auth; a missing key fails closed.
  return validateCronRequest(key, req.headers.get("authorization")).allowed;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenant: string }> },
): Promise<NextResponse> {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  if (!authorized(process.env.SPAM_PIT_WRITE_KEY, req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await readOptionalJsonObject(req);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
      ? (body.fields as Record<string, unknown>)
      : undefined;
    const record = await recordSpam(tenant, {
      reason: str(body.reason) ?? "unspecified",
      source: str(body.source),
      name: str(body.name),
      email: str(body.email),
      message: str(body.message),
      fields,
      ip: str(body.ip),
      userAgent: str(body.userAgent),
    });
    if (!record) return NextResponse.json({ error: "Store unavailable" }, { status: 503 });
    return NextResponse.json({ ok: true, id: record.id });
  } catch (err) {
    console.error("[v1 spam-pit POST]", tenant, err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenant: string }> },
): Promise<NextResponse> {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  if (!authorized(process.env.SPAM_PIT_READ_KEY, req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, Math.floor(limitRaw))) : 100;
  const items = await getSpam(tenant, limit);
  return NextResponse.json({ tenant, count: items.length, items });
}
