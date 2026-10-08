import { verifiedAuthenticationTime } from "./verified-auth-time";
import { hostOnlyAuthCookieOptions } from "@/platform/infra/db/auth-cookie-options";
/**
 * Request-scoped Supabase client for Strelva — the RLS-enforced auth path.
 *
 * Unlike the SERVICE_ROLE client in `client.ts` (full access, bypasses RLS, for
 * trusted control-plane work), this client carries the signed-in user's session
 * from cookies, so Row Level Security applies. This is the client that user-facing
 * request handlers may adopt when they are migrated to RLS-backed repositories.
 * Today application authorization guards are the live enforcement boundary.
 *
 * NULL-SAFE: returns null when Supabase Auth isn't configured (public env unset),
 * exactly like getSupabase()/getRedis(). Every consumer MUST handle null.
 *
 * Uses @supabase/ssr cookie adapter (getAll/setAll). Server-only — needs next/headers.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/platform/infra/db/database.types";

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

/** True when Supabase Auth is configured for this environment. */
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
            cookieStore.set(name, value, hostOnlyAuthCookieOptions(options));
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
  return (await getSessionAuthContext())?.user ?? null;
}

/**
 * Verified auth user and the signed session's authentication time. Step-up
 * actions use this instead of a caller-supplied timestamp or a decoded cookie.
 */
export async function getSessionAuthContext(): Promise<{
  user: NonNullable<Awaited<ReturnType<NonNullable<UserDb>["auth"]["getUser"]>>["data"]["user"]>;
  authTime: number | null;
} | null> {
  const db = await createUserClient();
  if (!db) return null;
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) return null;
  const { data: claimsData, error: claimsError } = await db.auth.getClaims();
  const claims = claimsData?.claims;
  const authTime = !claimsError && claims?.sub === userData.user.id
    ? verifiedAuthenticationTime(claims)
    : null;
  return { user: userData.user, authTime };
}
