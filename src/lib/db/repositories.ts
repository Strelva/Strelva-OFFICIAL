/**
 * Typed Postgres repositories — the Supabase side of the migration.
 *
 * Migration mirrors remain best-effort, but Postgres is now authoritative for
 * tenant, identity, content, collection, draft, audit, and activity mutations.
 * Those writes throw when unavailable or rejected so callers never report a
 * successful change that was not persisted. Reads retain their documented
 * empty/null fallbacks while the remaining legacy read paths are decommissioned.
 *
 * This file establishes the pattern on representative subsystems
 * (tenants, events, leads, build-payments, mail-log). The remaining 30 tables
 * follow the exact same shape — add them as each subsystem is migrated.
 */

import { getSupabase, type Row, type Insert } from "./client";

/** Explicitly best-effort work: migration mirrors, telemetry, and fallback reads. */
async function bestEffort<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[db] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

function requiredDb(label: string): NonNullable<ReturnType<typeof getSupabase>> {
  const db = getSupabase();
  if (!db) throw new Error(`[db] ${label} failed: Supabase is not configured`);
  return db;
}

/** Log an authoritative failure, then preserve it for the mutation boundary. */
async function required<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[db] ${label} failed:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// tenants
// ---------------------------------------------------------------------------

export async function getTenant(id: string): Promise<Row<"tenants"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getTenant ${id}`, async () => {
    const { data, error } = await db.from("tenants").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

export async function listActiveTenants(): Promise<Row<"tenants">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort("listActiveTenants", async () => {
    const { data, error } = await db.from("tenants").select("*").eq("active", true);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function upsertTenant(tenant: Insert<"tenants">): Promise<void> {
  const label = `upsertTenant ${tenant.id}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db.from("tenants").upsert(tenant);
    if (error) throw error;
  });
}

export { listAllDomainClaims, listDomainClaims, replaceDomainClaims } from "./domain-claims";

// ---------------------------------------------------------------------------
// unified_events (the event log: reviews, bookings, AI actions, change requests)
// ---------------------------------------------------------------------------

export async function insertEvent(event: Insert<"unified_events">): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`insertEvent ${event.tenant_id}`, async () => {
    const { data, error } = await db.from("unified_events").insert(event).select("id").single();
    if (error) throw error;
    return data.id;
  }, null);
}

export async function listEvents(tenantId: string, limit = 50): Promise<Row<"unified_events">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`listEvents ${tenantId}`, async () => {
    const { data, error } = await db
      .from("unified_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function setEventStatus(
  id: string,
  status: string,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await bestEffort(`setEventStatus ${id}`, async () => {
    const update: {
      status: string;
      resolved_at: string;
      metadata?: Insert<"unified_events">["metadata"];
    } = { status, resolved_at: new Date().toISOString() };
    // Mirror the updated metadata too (e.g. resolutionHistory) so the Postgres
    // shadow row stays in parity with Redis on resolve, not just status-frozen.
    if (metadata !== undefined) {
      update.metadata = (metadata ?? null) as Insert<"unified_events">["metadata"];
    }
    const { error } = await db.from("unified_events").update(update).eq("id", id);
    if (error) throw error;
  }, undefined);
}

// ---------------------------------------------------------------------------
// delivery_leads (pre-tenant prospects)
// ---------------------------------------------------------------------------

export async function upsertLead(lead: Insert<"delivery_leads">): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await bestEffort(`upsertLead ${lead.email}`, async () => {
    const { error } = await db.from("delivery_leads").upsert(lead, { onConflict: "email" });
    if (error) throw error;
  }, undefined);
}

export async function listLeads(): Promise<Row<"delivery_leads">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort("listLeads", async () => {
    const { data, error } = await db
      .from("delivery_leads")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ---------------------------------------------------------------------------
// build_payments (completed one-time payments / revenue)
// ---------------------------------------------------------------------------

export async function recordBuildPayment(payment: Insert<"build_payments">): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await bestEffort(`recordBuildPayment ${payment.session_id}`, async () => {
    const { error } = await db.from("build_payments").upsert(payment, { onConflict: "session_id" });
    if (error) throw error;
  }, undefined);
}

export async function listBuildPayments(): Promise<Row<"build_payments">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort("listBuildPayments", async () => {
    const { data, error } = await db
      .from("build_payments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ---------------------------------------------------------------------------
// mail_log (every outbound email — the weekly-report receipt)
// ---------------------------------------------------------------------------

export async function recordMailSendPg(entry: Insert<"mail_log">): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await bestEffort(`recordMailSendPg ${entry.tenant_id}`, async () => {
    const { error } = await db.from("mail_log").insert(entry);
    if (error) throw error;
  }, undefined);
}

export async function getMailLogPg(tenantId: string, limit = 50): Promise<Row<"mail_log">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`getMailLogPg ${tenantId}`, async () => {
    const { data, error } = await db
      .from("mail_log")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("ts", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ---------------------------------------------------------------------------
// IDENTITY & ACCESS — the Supabase Auth persistence boundary for src/lib/auth.ts.
// Users, memberships, super-admin grants, and invites are Postgres-authoritative.
// These repositories use
// the SERVICE_ROLE client deliberately — authorization computations (owner guard,
// super-admin check) must see across tenants, and they run server-side only.
// See docs/auth-tenancy-architecture.md (Plane 2).
// ---------------------------------------------------------------------------

// users -----------------------------------------------------------------------

export async function upsertUser(user: Insert<"users">): Promise<void> {
  const label = `upsertUser ${user.email}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db.from("users").upsert(user, { onConflict: "email" });
    if (error) throw error;
  });
}

export async function getUserByEmail(email: string): Promise<Row<"users"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getUserByEmail ${email}`, async () => {
    const { data, error } = await db.from("users").select("*").eq("email", email).maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

/** Legacy identity lookup retained only for rows imported during the Clerk cutover. */
export async function getUserByClerkId(clerkId: string): Promise<Row<"users"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getUserByClerkId ${clerkId}`, async () => {
    const { data, error } = await db.from("users").select("*").eq("clerk_id", clerkId).maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

// memberships -----------------------------------------------------------------

export async function listMembershipsForUser(userId: string): Promise<Row<"memberships">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`listMembershipsForUser ${userId}`, async () => {
    const { data, error } = await db.from("memberships").select("*").eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  }, []);
}

/** The user's role on a tenant, or null if they have no membership. */
export async function getMembershipRole(userId: string, tenantId: string): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getMembershipRole ${userId}/${tenantId}`, async () => {
    const { data, error } = await db
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw error;
    return data?.role ?? null;
  }, null);
}

/** User ids that are OWNER of a tenant, resolved in one indexed membership query. */
export async function listTenantOwnerIds(tenantId: string): Promise<string[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`listTenantOwnerIds ${tenantId}`, async () => {
    const { data, error } = await db
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if (error) throw error;
    return (data ?? []).map((m) => m.user_id);
  }, []);
}

export async function upsertMembership(membership: Insert<"memberships">): Promise<void> {
  const label = `upsertMembership ${membership.user_id}/${membership.tenant_id}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db
      .from("memberships")
      .upsert(membership, { onConflict: "user_id,tenant_id" });
    if (error) throw error;
  });
}

// super_admins ----------------------------------------------------------------

/** True if the user is an active super-admin (granted, not revoked). Replaces the
 *  SUPER_ADMIN_EMAILS env allowlist — same shape as the RLS app_is_super_admin(). */
export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  return bestEffort(`isSuperAdminUser ${userId}`, async () => {
    const { data, error } = await db
      .from("super_admins")
      .select("user_id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }, false);
}

// invites ---------------------------------------------------------------------

/** The pending (unclaimed, unexpired) invite for an email, optionally scoped to a
 *  tenant. Mirrors Redis reb:invites:{email}. */
export async function getPendingInvite(
  email: string,
  tenant?: string
): Promise<Row<"invites"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getPendingInvite ${email}`, async () => {
    let q = db
      .from("invites")
      .select("*")
      .eq("email", email)
      .is("claimed_at", null)
      .gt("expires_at", new Date().toISOString());
    if (tenant) q = q.eq("tenant_id", tenant);
    const { data, error } = await q.order("invited_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

export async function createInvite(invite: Insert<"invites">): Promise<void> {
  const label = `createInvite ${invite.email}/${invite.tenant_id}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db.from("invites").upsert(invite, { onConflict: "email,tenant_id" });
    if (error) throw error;
  });
}

/** Mark an invite claimed once access is granted (mirrors consumeInvite). */
export async function markInviteClaimed(email: string, tenantId: string): Promise<void> {
  const label = `markInviteClaimed ${email}/${tenantId}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db
      .from("invites")
      .update({ claimed_at: new Date().toISOString() })
      .eq("email", email)
      .eq("tenant_id", tenantId)
      .is("claimed_at", null);
    if (error) throw error;
  });
}

// ---------------------------------------------------------------------------
// CONTENT — Postgres is the authoritative content source.
// `section` retains the deployed compatibility identifier formerly used as a
// document type; `data` is the canonical section JSONB.
// ---------------------------------------------------------------------------

export async function getContentData(
  tenant: string,
  section: string
): Promise<Record<string, unknown> | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getContentData ${tenant}/${section}`, async () => {
    const { data, error } = await db
      .from("content")
      .select("data")
      .eq("tenant_id", tenant)
      .eq("section", section)
      .maybeSingle();
    if (error) throw error;
    return (data?.data as Record<string, unknown> | undefined) ?? null;
  }, null);
}

/** Upsert a content section's data. Throws so callers cannot report a rejected
 *  authoritative write as success and can invalidate any stale cache. */
export async function upsertContentData(
  tenant: string,
  section: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase not configured");
  const { error } = await db
    .from("content")
    .upsert(
      { tenant_id: tenant, section, data: data as Insert<"content">["data"] },
      { onConflict: "tenant_id,section" }
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// collection_entries (Collections CMS — typed repeating entries)
// See src/lib/cms/collection-types.ts + docs/strelva-cms-scope.md.
// ---------------------------------------------------------------------------

export async function listEntries(
  tenantId: string,
  type: string,
  opts?: { status?: string; limit?: number }
): Promise<Row<"collection_entries">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`listEntries ${tenantId}/${type}`, async () => {
    let q = db
      .from("collection_entries")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("type", type)
      .order("updated_at", { ascending: false })
      .limit(opts?.limit ?? 100);
    if (opts?.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function getEntryBySlug(
  tenantId: string,
  type: string,
  slug: string
): Promise<Row<"collection_entries"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getEntryBySlug ${tenantId}/${type}/${slug}`, async () => {
    const { data, error } = await db
      .from("collection_entries")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("type", type)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

/** Create or update an entry (keyed on tenant_id+type+slug). Returns the row. */
export async function upsertEntry(
  entry: Insert<"collection_entries">
): Promise<Row<"collection_entries">> {
  const label = `upsertEntry ${entry.tenant_id}/${entry.type}/${entry.slug}`;
  const db = requiredDb(label);
  return required(label, async () => {
    const { data, error } = await db
      .from("collection_entries")
      .upsert({ ...entry, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,type,slug" })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });
}

export async function deleteEntry(tenantId: string, type: string, slug: string): Promise<void> {
  const label = `deleteEntry ${tenantId}/${type}/${slug}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db
      .from("collection_entries")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("type", type)
      .eq("slug", slug);
    if (error) throw error;
  });
}

// ---------------------------------------------------------------------------
// draft_content (unpublished section drafts — the admin override queue source)
// ---------------------------------------------------------------------------

export async function getDraftContentData(
  tenant: string,
  section: string
): Promise<Record<string, unknown> | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getDraftContentData ${tenant}/${section}`, async () => {
    const { data, error } = await db
      .from("draft_content")
      .select("data")
      .eq("tenant_id", tenant)
      .eq("section", section)
      .maybeSingle();
    if (error) throw error;
    return (data?.data as Record<string, unknown>) ?? null;
  }, null);
}

export async function upsertDraftContentData(
  tenant: string,
  section: string,
  data: Record<string, unknown>
): Promise<void> {
  const label = `upsertDraftContentData ${tenant}/${section}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db
      .from("draft_content")
      .upsert(
        { tenant_id: tenant, section, data: data as Insert<"draft_content">["data"], updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,section" }
      );
    if (error) throw error;
  });
}

export async function deleteDraftContentData(tenant: string, section: string): Promise<void> {
  const label = `deleteDraftContentData ${tenant}/${section}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db
      .from("draft_content")
      .delete()
      .eq("tenant_id", tenant)
      .eq("section", section);
    if (error) throw error;
  });
}

export async function listDraftSections(tenant: string): Promise<string[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`listDraftSections ${tenant}`, async () => {
    const { data, error } = await db
      .from("draft_content")
      .select("section")
      .eq("tenant_id", tenant);
    if (error) throw error;
    return (data ?? []).map((r) => r.section);
  }, []);
}

// ---------------------------------------------------------------------------
// audit_logs (super-admin action trail)
// ---------------------------------------------------------------------------

export async function insertAuditLog(entry: Insert<"audit_logs">): Promise<void> {
  const label = `insertAuditLog ${entry.id}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db.from("audit_logs").insert(entry);
    if (error) throw error;
  });
}

export async function listAuditLogs(tenant: string, limit = 100): Promise<Row<"audit_logs">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`listAuditLogs ${tenant}`, async () => {
    const { data, error } = await db
      .from("audit_logs")
      .select("*")
      .eq("tenant_id", tenant)
      .order("time", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function listAllAuditLogs(limit = 100): Promise<Row<"audit_logs">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort("listAllAuditLogs", async () => {
    const { data, error } = await db
      .from("audit_logs")
      .select("*")
      .order("time", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ---------------------------------------------------------------------------
// activity_log (content-change trail; dashboard activity feed)
// ---------------------------------------------------------------------------

export async function insertActivity(entry: Insert<"activity_log">): Promise<void> {
  const label = `insertActivity ${entry.tenant_id}`;
  const db = requiredDb(label);
  await required(label, async () => {
    const { error } = await db.from("activity_log").insert(entry);
    if (error) throw error;
  });
}

export async function listActivity(
  tenant: string,
  opts?: { section?: string; actor?: string; limit?: number }
): Promise<Row<"activity_log">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort(`listActivity ${tenant}`, async () => {
    let q = db
      .from("activity_log")
      .select("*")
      .eq("tenant_id", tenant)
      .order("time", { ascending: false })
      .limit(opts?.limit ?? 50);
    if (opts?.section) q = q.eq("section", opts.section);
    if (opts?.actor) q = q.eq("actor", opts.actor);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }, []);
}

// ---------------------------------------------------------------------------
// tenants — list ALL (loadTenants returns every tenant; callers filter active)
// ---------------------------------------------------------------------------

export async function listAllTenants(): Promise<Row<"tenants">[]> {
  const db = getSupabase();
  if (!db) return [];
  return bestEffort("listAllTenants", async () => {
    const { data, error } = await db
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);
}
