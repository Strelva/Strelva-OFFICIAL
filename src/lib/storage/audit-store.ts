/**
 * Admin audit logging - append-only trail for Scaffold super-admin actions.
 */

import { getSanityClient, getSanityReadClient } from "../sanity";
import type { ActorContext } from "../auth";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { insertAuditLog, listAuditLogs, listAllAuditLogs } from "../db/repositories";
import type { Row, Insert } from "../db/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function auditToInsert(e: AuditLogEntry): Insert<"audit_logs"> {
  return {
    id: e.id,
    tenant_id: e.tenant,
    action: e.action,
    target_type: e.targetType,
    target_id: e.targetId ?? null,
    time: e.time,
    // actor_user_id FKs users(id) (uuid); the Clerk-era id is not a uuid, so null it.
    actor_user_id: e.actor.userId && UUID_RE.test(e.actor.userId) ? e.actor.userId : null,
    actor_email: e.actor.email ?? null,
    actor_type: e.actor.type ?? null,
    actor_is_super_admin: e.actor.isSuperAdmin,
    metadata: (e.metadata ?? null) as Insert<"audit_logs">["metadata"],
  };
}

function mapPgAuditRow(row: Row<"audit_logs">): AuditLogEntry {
  return {
    id: row.id,
    tenant: row.tenant_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id ?? undefined,
    time: row.time,
    actor: {
      userId: row.actor_user_id,
      email: row.actor_email,
      type: (row.actor_type as AuditLogEntry["actor"]["type"]) || "super_admin",
      isSuperAdmin: row.actor_is_super_admin,
    },
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
  };
}

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

  if (dataSourceIsPostgres()) {
    await insertAuditLog(auditToInsert(auditEntry));
  }

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

  if (!dataSourceIsPostgres()) {
    const store = await readDevContent(auditEntry.tenant);
    const audit = (store.__audit as AuditLogEntry[]) ?? [];
    audit.unshift(auditEntry);
    store.__audit = audit.slice(0, 500);
    await writeDevContent(store, auditEntry.tenant);
  }
  return auditEntry;
}

interface SanityAuditRow {
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
}

const AUDIT_PROJECTION = `{
  auditId, tenant, action, targetType, targetId, time,
  actorUserId, actorEmail, actorType, actorIsSuperAdmin, metadata
}`;

function mapAuditRow(entry: SanityAuditRow): AuditLogEntry {
  return {
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
  };
}

export async function getAuditLog(
  tenant: string = DEFAULT_TENANT,
  limit = 100
): Promise<AuditLogEntry[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  if (dataSourceIsPostgres()) {
    const rows = await listAuditLogs(tenant, safeLimit);
    if (rows.length > 0 || !hasSanity) return rows.map(mapPgAuditRow);
    // fall through to Sanity only if Postgres is empty and Sanity still configured
  }

  if (hasSanity) {
    const raw = await getSanityReadClient().fetch<SanityAuditRow[]>(
      `*[_type == "auditLog" && tenant == $tenant] | order(time desc)[0...${safeLimit}]${AUDIT_PROJECTION}`,
      { tenant }
    );
    return raw.map(mapAuditRow);
  }

  const store = await readDevContent(tenant);
  const audit = (store.__audit as AuditLogEntry[]) ?? [];
  return audit.slice(0, safeLimit);
}

/**
 * Portfolio-wide audit feed (all tenants), newest first. Powers the operator
 * audit view in Mission Control. In production this is a single cross-tenant
 * Sanity query; in dev (no Sanity) it falls back to the default-tenant log,
 * since dev audit is per-file and local-only.
 */
export async function getAllAuditEvents(limit = 100): Promise<AuditLogEntry[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  if (dataSourceIsPostgres()) {
    const rows = await listAllAuditLogs(safeLimit);
    if (rows.length > 0 || !hasSanity) return rows.map(mapPgAuditRow);
  }

  if (hasSanity) {
    const raw = await getSanityReadClient().fetch<SanityAuditRow[]>(
      `*[_type == "auditLog"] | order(time desc)[0...${safeLimit}]${AUDIT_PROJECTION}`
    );
    return raw.map(mapAuditRow);
  }
  return getAuditLog(DEFAULT_TENANT, safeLimit);
}

function parseMetadata(metadata: string | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
