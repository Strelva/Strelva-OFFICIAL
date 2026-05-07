/**
 * Admin audit logging - append-only trail for Scaffold super-admin actions.
 */

import { getSanityClient, getSanityReadClient } from "../sanity";
import type { ActorContext } from "../auth";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";

export interface AuditLogEntry {
  id: string;
  tenant: string;
  action: string;
  targetType: string;
  targetId?: string;
  time: string;
  actor: Pick<ActorContext, "userId" | "email" | "type" | "isSuperAdmin">;
  metadata?: Record<string, unknown>;
}

export function makeAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function logAuditEvent(
  entry: Omit<AuditLogEntry, "id" | "time"> & { id?: string; time?: string }
): Promise<AuditLogEntry> {
  const auditEntry: AuditLogEntry = {
    id: entry.id || makeAuditId(),
    time: entry.time || new Date().toISOString(),
    tenant: entry.tenant || DEFAULT_TENANT,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    actor: entry.actor,
    metadata: entry.metadata,
  };

  if (hasSanity) {
    await getSanityClient().create({
      _type: "auditLog",
      tenant: auditEntry.tenant,
      auditId: auditEntry.id,
      action: auditEntry.action,
      targetType: auditEntry.targetType,
      targetId: auditEntry.targetId,
      time: auditEntry.time,
      actorUserId: auditEntry.actor.userId,
      actorEmail: auditEntry.actor.email,
      actorType: auditEntry.actor.type,
      actorIsSuperAdmin: auditEntry.actor.isSuperAdmin,
      metadata: auditEntry.metadata === undefined ? undefined : JSON.stringify(auditEntry.metadata),
    });
    return auditEntry;
  }

  const store = await readDevContent(auditEntry.tenant);
  const audit = (store.__audit as AuditLogEntry[]) ?? [];
  audit.unshift(auditEntry);
  store.__audit = audit.slice(0, 500);
  await writeDevContent(store, auditEntry.tenant);
  return auditEntry;
}

export async function getAuditLog(
  tenant: string = DEFAULT_TENANT,
  limit = 100
): Promise<AuditLogEntry[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  if (hasSanity) {
    const raw = await getSanityReadClient().fetch<
      Array<{
        auditId: string;
        tenant: string;
        action: string;
        targetType: string;
        targetId?: string;
        time: string;
        actorUserId?: string;
        actorEmail?: string;
        actorType?: AuditLogEntry["actor"]["type"];
        actorIsSuperAdmin?: boolean;
        metadata?: string;
      }>
    >(
      `*[_type == "auditLog" && tenant == $tenant] | order(time desc)[0...${safeLimit}]{
        auditId, tenant, action, targetType, targetId, time,
        actorUserId, actorEmail, actorType, actorIsSuperAdmin, metadata
      }`,
      { tenant }
    );

    return raw.map((entry) => ({
      id: entry.auditId,
      tenant: entry.tenant,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      time: entry.time,
      actor: {
        userId: entry.actorUserId || null,
        email: entry.actorEmail || null,
        type: entry.actorType || "super_admin",
        isSuperAdmin: Boolean(entry.actorIsSuperAdmin),
      },
      metadata: parseMetadata(entry.metadata),
    }));
  }

  const store = await readDevContent(tenant);
  const audit = (store.__audit as AuditLogEntry[]) ?? [];
  return audit.slice(0, safeLimit);
}

function parseMetadata(metadata: string | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
