import { NextResponse } from "next/server";
import {
  createSiteSnapshot,
  getSiteSnapshots,
  logActivity,
  logAuditEvent,
  restoreSiteSnapshot,
} from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import {
  getActorContext,
  requireTenantAccess,
  requireTenantPermission,
} from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";

export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const snapshots = await getSiteSnapshots(tenant, 12);
  return NextResponse.json({ snapshots });
}

export async function POST(request: Request) {
  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const actor = await getActorContext(tenant);
  const action = typeof body.action === "string" ? body.action : "create";

  if (action === "create") {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : undefined;
    const snapshot = await createSiteSnapshot(tenant, {
      reason: "manual",
      label: label || undefined,
      author: actor.isImpersonating ? "admin" : "user",
      actor,
    });

    await logActivity({
      text: actor.isImpersonating
        ? "Strelva admin saved a full-site backup"
        : "Saved a full-site backup",
      time: snapshot.createdAt,
      type: "admin",
      actor: actor.isImpersonating ? "admin" : "user",
      changes: [
        {
          field: "site_backup",
          before: "",
          after: snapshot.label,
        },
      ],
      suppressEvent: true,
    }, tenant);

    if (actor.isImpersonating) {
      await logAuditEvent({
        tenant,
        actor,
        action: "site_snapshot.created",
        targetType: "site_snapshot",
        targetId: snapshot.id,
        metadata: { label: snapshot.label, reason: snapshot.reason },
      });
    }

    const { data: _data, actor: _actor, ...summary } = snapshot;
    return NextResponse.json({ snapshot: summary }, { status: 201 });
  }

  if (action === "restore") {
    const snapshotId = typeof body.snapshotId === "string" ? body.snapshotId : "";
    if (!snapshotId) {
      return NextResponse.json({ error: "snapshotId required" }, { status: 400 });
    }

    try {
      const result = await restoreSiteSnapshot(tenant, snapshotId, { actor });

      await logActivity({
        text: actor.isImpersonating
          ? `Strelva admin restored full site from ${result.restored.label}`
          : `Restored full site from ${result.restored.label}`,
        time: new Date().toISOString(),
        type: "admin",
        actor: actor.isImpersonating ? "admin" : "user",
        changes: [
          {
            field: "site_restore",
            before: result.preRestore.label,
            after: result.restored.label,
          },
        ],
        suppressEvent: true,
      }, tenant);

      if (actor.isImpersonating) {
        await logAuditEvent({
          tenant,
          actor,
          action: "site_snapshot.restored",
          targetType: "site_snapshot",
          targetId: snapshotId,
          metadata: {
            restoredLabel: result.restored.label,
            preRestoreSnapshotId: result.preRestore.id,
          },
        });
      }

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Snapshot restore failed." },
        { status: 404 },
      );
    }
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
