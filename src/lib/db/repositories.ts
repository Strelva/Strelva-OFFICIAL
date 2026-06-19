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

export async function setEventStatus(id: string, status: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await safe(`setEventStatus ${id}`, async () => {
    const { error } = await db
      .from("unified_events")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id);
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
