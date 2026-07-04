import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import {
  getTenantCrm,
  setTenantTags,
  setTenantStage,
  addTenantNote,
  type CrmStage,
  type TenantCrm,
} from "@/lib/tenant-crm";

/**
 * Operator CRM for one tenant — the lightweight client record (pipeline stage,
 * tags, note log) behind the admin surface.
 *
 * GET  — read the tenant's CRM record.
 * POST — apply whichever of { tags, stage, note } are present, return the final
 *        state. Audit-logged. Super-admin only.
 */

const STAGES: CrmStage[] = ["lead", "building", "live", "at_risk", "churned"];

function isStage(value: unknown): value is CrmStage {
  return typeof value === "string" && STAGES.includes(value as CrmStage);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return NextResponse.json({ crm: await getTenantCrm(id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { tags, stage, note } = (body ?? {}) as {
    tags?: unknown;
    stage?: unknown;
    note?: unknown;
  };

  if (stage !== undefined && !isStage(stage)) {
    return NextResponse.json(
      { error: `stage must be one of: ${STAGES.join(", ")}.` },
      { status: 400 },
    );
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return NextResponse.json({ error: "tags must be an array of strings." }, { status: 400 });
  }
  const noteText = typeof note === "string" ? note.trim() : "";
  if (note !== undefined && !noteText) {
    return NextResponse.json({ error: "note must be a non-empty string." }, { status: 400 });
  }

  const applied: string[] = [];
  let crm: TenantCrm = await getTenantCrm(id);
  if (Array.isArray(tags)) {
    crm = await setTenantTags(id, tags as string[]);
    applied.push("tags");
  }
  if (isStage(stage)) {
    crm = await setTenantStage(id, stage);
    applied.push("stage");
  }
  if (noteText) {
    const actor = await getActorContext(id);
    crm = await addTenantNote(id, noteText, actor.email ?? "operator");
    applied.push("note");
  }

  if (applied.length > 0) {
    await logAuditEvent({
      tenant: id,
      action: "crm.update",
      targetType: "tenant",
      targetId: id,
      actor: await getActorContext(id),
      metadata: { fields: applied },
    }).catch(() => {});
  }

  return NextResponse.json({ crm });
}
