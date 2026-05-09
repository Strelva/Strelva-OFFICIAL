import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import {
  getMember,
  logTransaction,
  saveMember,
} from "@/lib/rewards/memberRepositoryKv";
import { KvNotConfiguredError } from "@/lib/rewards/kv";
import { readJsonObject } from "@/lib/request-body";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const { email: rawEmail } = await params;
    const email = decodeURIComponent(rawEmail);

    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "settings:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const delta = typeof body.delta === "number" ? body.delta : NaN;
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json(
        { error: "delta must be a non-zero number" },
        { status: 422 }
      );
    }
    if (!note) {
      return NextResponse.json({ error: "note is required" }, { status: 422 });
    }

    const existing = await getMember(tenant, email);
    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const updated = {
      ...existing,
      starsAvailable: Math.max(0, existing.starsAvailable + delta),
      starsLifetime:
        delta > 0 ? existing.starsLifetime + delta : existing.starsLifetime,
    };
    await saveMember(tenant, updated);

    const txn = await logTransaction(
      tenant,
      email,
      delta > 0 ? "admin-credit" : "admin-debit",
      Math.abs(delta),
      note
    );

    return NextResponse.json({ member: updated, transaction: txn });
  } catch (err) {
    if (err instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: "kv not configured" }, { status: 503 });
    }
    console.error("[rewards adjust POST]", err);
    return NextResponse.json({ error: "Failed to adjust stars" }, { status: 500 });
  }
}
