import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getActorContext, requireTenantPermission } from "@/platform/infra/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import {
  adjustStarsWithTransaction,
  InsufficientStarsError,
} from "@/lib/rewards/memberRepositoryKv";
import { KvNotConfiguredError } from "@/lib/rewards/kv";
import { readJsonObject } from "@/lib/request-body";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  let recoveryCommandId: string | undefined;
  try {
    const { email: rawEmail } = await params;
    const email = decodeURIComponent(rawEmail);

    const tenant = await getTenantFromHeaders();
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

    if (!Number.isFinite(delta) || !Number.isSafeInteger(delta) || delta === 0) {
      return NextResponse.json(
        { error: "delta must be a non-zero safe integer" },
        { status: 422 }
      );
    }
    if (!note) {
      return NextResponse.json({ error: "note is required" }, { status: 422 });
    }

    const commandId = body.commandId;
    if (commandId !== undefined && (typeof commandId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(commandId))) {
      return NextResponse.json({ error: "Invalid commandId" }, { status: 422 });
    }
    recoveryCommandId = typeof commandId === "string" ? commandId : randomUUID();
    const actor = await getActorContext(tenant);
    let updated;
    try {
      updated = await adjustStarsWithTransaction(tenant, email, delta, note,
        actor.userId && actor.email ? { userId: actor.userId, verifiedEmail: actor.email } : undefined,
        recoveryCommandId);
    } catch (adjustErr) {
      if (adjustErr instanceof InsufficientStarsError) {
        return NextResponse.json(
          { error: "Insufficient stars balance" },
          { status: 422 }
        );
      }
      throw adjustErr;
    }
    if (!updated) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json({ ...updated, commandId: recoveryCommandId });
  } catch (err) {
    if (err instanceof Error && err.message === "rewards_access_denied") {
      return NextResponse.json({ error: "Forbidden: rewards permission changed" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "rewards_command_conflict") {
      return NextResponse.json({ error: "commandId already used for another adjustment" }, { status: 409 });
    }
    if (err instanceof Error && ["rewards_mutation_unconfirmed", "rewards_adjustment_unconfirmed"].includes(err.message)) {
      return NextResponse.json({ error: "Adjustment outcome is unconfirmed. Retain commandId to recover this same adjustment.", commandId: recoveryCommandId, recoveryRequired: true }, { status: 500 });
    }
    if (err instanceof Error && err.message === "rewards_legacy_adjustment_unconfirmed") {
      return NextResponse.json({ error: "Adjustment outcome is unconfirmed. Verify balance and transaction history before trying again.", recoveryRequired: true }, { status: 500 });
    }
    if (err instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: "kv not configured" }, { status: 503 });
    }
    console.error("[rewards adjust POST]", err);
    return NextResponse.json({ error: "Failed to adjust stars" }, { status: 500 });
  }
}
