import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createSiteSnapshot,
  getSiteSnapshots,
  logActivity,
  logAuditEvent,
  recordSectionUpdate,
  restoreSiteSnapshot,
  SiteSnapshotBackupFailedError,
  SiteSnapshotNotFoundError,
  SiteSnapshotRestoreFailedError,
} from "@/lib/storage";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";
import { refreshLiveSite } from "@/lib/live-site-refresh";
import { getTenantFromHeaders } from "@/lib/tenant";
import {
  getActorContext,
  requireTenantAccess,
  requireTenantPermission,
} from "@/platform/infra/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";

export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  await authorizeTenantOperatorRead(tenant);

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

    let result: Awaited<ReturnType<typeof restoreSiteSnapshot>>;
    try {
      result = await restoreSiteSnapshot(tenant, snapshotId, { actor });
    } catch (error) {
      if (error instanceof SiteSnapshotNotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error instanceof SiteSnapshotBackupFailedError) {
        return NextResponse.json({ error: error.message, restored: false }, { status: 503 });
      }
      if (error instanceof SiteSnapshotRestoreFailedError) {
        return NextResponse.json(
          {
            error: error.message,
            restored: false,
            rolledBack: error.rolledBack,
            sectionsNeedingAttention: error.sectionsNeedingAttention,
          },
          { status: 500 },
        );
      }
      console.error("[site-snapshots] restore failed", error);
      return NextResponse.json({ error: "Snapshot restore failed." }, { status: 500 });
    }

    // The restore is done. Bookkeeping can never turn it into an error.
    try {
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
    } catch (err) {
      console.error("[site-snapshots] activity not logged", err);
    }

    if (actor.isImpersonating) {
      try {
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
      } catch (err) {
        console.error("[site-snapshots] audit not logged", err);
      }
    }

    for (const section of result.restoredSections) {
      try {
        await recordSectionUpdate(section, tenant);
      } catch (err) {
        console.error("[site-snapshots] section timestamp not recorded", section, err);
      }
    }

    revalidatePath("/");
    const liveSite = await refreshLiveSite(tenant, clientRevalidationTargetForSections(result.restoredSections));
    return NextResponse.json({ ...result, liveSite });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
