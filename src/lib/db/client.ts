/**
 * Shared Supabase (Postgres) client for Strelva — the migration target.
 *
 * Server-only. Uses the SERVICE_ROLE key (full access; bypasses RLS) for trusted
 * control-plane operations. Returns null when SUPABASE_URL or
 * SUPABASE_SERVICE_ROLE_KEY is unset — exactly like getRedis(), so the app keeps
 * running on Clerk + Sanity + Redis until a subsystem is explicitly migrated and
 * the env is set. Every consumer MUST handle null.
 *
 * Types are generated from the live schema: `src/lib/db/database.types.ts`
 * (regen: `supabase gen types typescript --project-id <ref>`).
 *
 * NOTE: SERVICE_ROLE bypasses RLS, so this client must never be reachable from
 * the browser. Per-user, RLS-enforced access comes with the auth migration
 * (migration 0003) via a request-scoped client carrying the user's JWT.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;

let _instance: Db | null | undefined;

/** Get the shared server Supabase client. Returns null if not configured. */
export function getSupabase(): Db | null {
  if (_instance !== undefined) return _instance;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    _instance = null;
    return null;
  }

  try {
    _instance = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return _instance;
  } catch {
    _instance = null;
    return null;
  }
}

/** True when Supabase is configured (env set). Lets callers branch on dual-write. */
export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}

// Convenience aliases for the generated Row/Insert/Update types, so repositories
// read `TenantRow` instead of `Database["public"]["Tables"]["tenants"]["Row"]`.
type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Insert<T extends keyof Tables> = Tables[T]["Insert"];
export type Update<T extends keyof Tables> = Tables[T]["Update"];
