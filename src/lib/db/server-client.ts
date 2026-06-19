/**
 * Request-scoped Supabase client for Strelva — the RLS-enforced auth path.
 *
 * Unlike the SERVICE_ROLE client in `client.ts` (full access, bypasses RLS, for
 * trusted control-plane work), this client carries the signed-in user's session
 * from cookies, so Row Level Security applies. This is the client that user-facing
 * request handlers should use once auth is migrated — RLS becomes the hard floor
 * under any authorization bug (see docs/auth-tenancy-architecture.md, Plane 3).
 *
 * NULL-SAFE: returns null when Supabase Auth isn't configured (public env unset),
 * exactly like getSupabase()/getRedis(), so the app keeps running on Clerk until
 * the auth swap is flipped on. Every consumer MUST handle null.
 *
 * Uses @supabase/ssr cookie adapter (getAll/setAll). Server-only — needs next/headers.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type UserDb = SupabaseClient<Database>;

/** Public (browser-safe) Supabase env. Accepts the new "publishable" key name or
 *  the conventional anon-key name. Returns null if either is unset. */
function publicSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

/** True when Supabase Auth is configured for this environment. Use as the cutover
 *  flag: callers prefer this client when true, fall back to Clerk when false. */
export function isSupabaseAuthConfigured(): boolean {
  return publicSupabaseEnv() !== null;
}

/**
 * Request-scoped client carrying the user's session from cookies. RLS-enforced.
 * Returns null when Supabase Auth isn't configured.
 */
export async function createUserClient(): Promise<UserDb | null> {
  const env = publicSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where the cookie store is read-only.
          // Safe to ignore: the proxy refreshes the session cookie on each request.
        }
      },
    },
  });
}

/**
 * The authenticated user for this request, or null.
 *
 * Uses `getUser()`, which re-validates the JWT against the Supabase Auth server.
 * NEVER trust `getSession()` alone for authorization — it only decodes the cookie
 * without verifying it.
 */
export async function getSessionUser() {
  const db = await createUserClient();
  if (!db) return null;
  const { data, error } = await db.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
