/**
 * Typed Postgres repositories — the Supabase side of the migration.
 *
 * Design for the migration's dual-write phase: every function is NULL-SAFE.
 * When Supabase isn't configured (env unset), reads return empty/null and
 * writes are no-ops, so a caller can dual-write to Redis + Postgres without a
 * branch and without breaking anything while Postgres is dark. Once a subsystem
 * cuts over, reads come from here with a Redis fallback.
 *
 * This file establishes the pattern on representative subsystems
 * (tenants, events, leads, build-payments, mail-log). The remaining 30 tables
 * follow the exact same shape — add them as each subsystem is migrated.
 */

import { getSupabase, type Row, type Insert } from "./client";

/** Wrap a query; log + swallow so a Postgres hiccup never breaks the caller. */
async function safe<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[db] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// tenants
// ---------------------------------------------------------------------------

export async function getTenant(id: string): Promise<Row<"tenants"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return safe(`getTenant ${id}`, async () => {
    const { data, error } = await db.from("tenants").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

export async function listActiveTenants(): Promise<Row<"tenants">[]> {
  const db = getSupabase();
  if (!db) return [];
  return safe("listActiveTenants", async () => {
    const { data, error } = await db.from("tenants").select("*").eq("active", true);
    if (error) throw error;
    return data ?? [];
  }, []);
}

export async function upsertTenant(tenant: Insert<"tenants">): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await safe(`upsertTenant ${tenant.id}`, async () => {
    const { error } = await db.from("tenants").upsert(tenant);
    if (error) throw error;
  }, undefined);
}

// ---------------------------------------------------------------------------
// unified_events (the event log: reviews, bookings, AI actions, change requests)
// ---------------------------------------------------------------------------

export async function insertEvent(event: Insert<"unified_events">): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  return safe(`insertEvent ${event.tenant_id}`, async () => {
    const { data, error } = await db.from("unified_events").insert(event).select("id").single();
    if (error) throw error;
    return data.id;
  }, null);
}

export async function listEvents(tenantId: string, limit = 50): Promise<Row<"unified_events">[]> {
  const db = getSupabase();
  if (!db) return [];
  return safe(`listEvents ${tenantId}`, async () => {
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
  await safe(`setEventStatus ${id}`, async () => {
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
  await safe(`upsertLead ${lead.email}`, async () => {
    const { error } = await db.from("delivery_leads").upsert(lead, { onConflict: "email" });
    if (error) throw error;
  }, undefined);
}

export async function listLeads(): Promise<Row<"delivery_leads">[]> {
  const db = getSupabase();
  if (!db) return [];
  return safe("listLeads", async () => {
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
  await safe(`recordBuildPayment ${payment.session_id}`, async () => {
    const { error } = await db.from("build_payments").upsert(payment, { onConflict: "session_id" });
    if (error) throw error;
  }, undefined);
}

export async function listBuildPayments(): Promise<Row<"build_payments">[]> {
  const db = getSupabase();
  if (!db) return [];
  return safe("listBuildPayments", async () => {
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
  await safe(`recordMailSendPg ${entry.tenant_id}`, async () => {
    const { error } = await db.from("mail_log").insert(entry);
    if (error) throw error;
  }, undefined);
}

export async function getMailLogPg(tenantId: string, limit = 50): Promise<Row<"mail_log">[]> {
  const db = getSupabase();
  if (!db) return [];
  return safe(`getMailLogPg ${tenantId}`, async () => {
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
// IDENTITY & ACCESS — the Supabase-Auth target for src/lib/auth.ts.
// Today these reads live in Clerk publicMetadata + the SUPER_ADMIN_EMAILS env
// allowlist + Redis invites. These repos back the auth swap (Phase 4); they use
// the SERVICE_ROLE client deliberately — authorization computations (owner guard,
// super-admin check) must see across tenants, and they run server-side only.
// See docs/auth-tenancy-architecture.md (Plane 2) + docs/supabase-migration-plan.md.
// ---------------------------------------------------------------------------

// users -----------------------------------------------------------------------

export async function upsertUser(user: Insert<"users">): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await safe(`upsertUser ${user.email}`, async () => {
    const { error } = await db.from("users").upsert(user, { onConflict: "email" });
    if (error) throw error;
  }, undefined);
}

export async function getUserByEmail(email: string): Promise<Row<"users"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return safe(`getUserByEmail ${email}`, async () => {
    const { data, error } = await db.from("users").select("*").eq("email", email).maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

export async function getUserByClerkId(clerkId: string): Promise<Row<"users"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return safe(`getUserByClerkId ${clerkId}`, async () => {
    const { data, error } = await db.from("users").select("*").eq("clerk_id", clerkId).maybeSingle();
    if (error) throw error;
    return data;
  }, null);
}

// memberships -----------------------------------------------------------------

export async function listMembershipsForUser(userId: string): Promise<Row<"memberships">[]> {
  const db = getSupabase();
  if (!db) return [];
  return safe(`listMembershipsForUser ${userId}`, async () => {
    const { data, error } = await db.from("memberships").select("*").eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  }, []);
}

/** The user's role on a tenant, or null if they have no membership. */
export async function getMembershipRole(userId: string, tenantId: string): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  return safe(`getMembershipRole ${userId}/${tenantId}`, async () => {
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

/** User ids that are OWNER of a tenant. Replaces the paginated Clerk user-list
 *  scan in getTenantOwnerUserIds — one indexed query (memberships_tenant_role_idx). */
export async function listTenantOwnerIds(tenantId: string): Promise<string[]> {
  const db = getSupabase();
  if (!db) return [];
  return safe(`listTenantOwnerIds ${tenantId}`, async () => {
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
  const db = getSupabase();
  if (!db) return;
  await safe(`upsertMembership ${membership.user_id}/${membership.tenant_id}`, async () => {
    const { error } = await db
      .from("memberships")
      .upsert(membership, { onConflict: "user_id,tenant_id" });
    if (error) throw error;
  }, undefined);
}

// super_admins ----------------------------------------------------------------

/** True if the user is an active super-admin (granted, not revoked). Replaces the
 *  SUPER_ADMIN_EMAILS env allowlist — same shape as the RLS app_is_super_admin(). */
export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  return safe(`isSuperAdminUser ${userId}`, async () => {
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
  return safe(`getPendingInvite ${email}`, async () => {
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
  const db = getSupabase();
  if (!db) return;
  await safe(`createInvite ${invite.email}/${invite.tenant_id}`, async () => {
    const { error } = await db.from("invites").upsert(invite, { onConflict: "email,tenant_id" });
    if (error) throw error;
  }, undefined);
}

/** Mark an invite claimed once access is granted (mirrors consumeInvite). */
export async function markInviteClaimed(email: string, tenantId: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await safe(`markInviteClaimed ${email}/${tenantId}`, async () => {
    const { error } = await db
      .from("invites")
      .update({ claimed_at: new Date().toISOString() })
      .eq("email", email)
      .eq("tenant_id", tenantId)
      .is("claimed_at", null);
    if (error) throw error;
  }, undefined);
}

// ---------------------------------------------------------------------------
// CONTENT (Phase 3 — Postgres as the content source, replacing Sanity).
// `section` is the stored Sanity _type (= SECTION_TO_TYPE[appSection]); `data` is
// the section JSONB. Null-safe: returns null when Supabase is unconfigured so the
// content store falls through to Sanity.
// ---------------------------------------------------------------------------

export async function getContentData(
  tenant: string,
  section: string
): Promise<Record<string, unknown> | null> {
  const db = getSupabase();
  if (!db) return null;
  return safe(`getContentData ${tenant}/${section}`, async () => {
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

/** Upsert a content section's data. Throws on failure so the content store can
 *  invalidate the cache and surface the error (matches the Sanity write path). */
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
  return safe(`listEntries ${tenantId}/${type}`, async () => {
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
  return safe(`getEntryBySlug ${tenantId}/${type}/${slug}`, async () => {
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
): Promise<Row<"collection_entries"> | null> {
  const db = getSupabase();
  if (!db) return null;
  return safe(`upsertEntry ${entry.tenant_id}/${entry.type}/${entry.slug}`, async () => {
    const { data, error } = await db
      .from("collection_entries")
      .upsert({ ...entry, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,type,slug" })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }, null);
}

export async function deleteEntry(tenantId: string, type: string, slug: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await safe(`deleteEntry ${tenantId}/${type}/${slug}`, async () => {
    const { error } = await db
      .from("collection_entries")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("type", type)
      .eq("slug", slug);
    if (error) throw error;
  }, undefined);
}
