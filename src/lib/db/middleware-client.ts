/**
 * Middleware/proxy Supabase client (migration Phase 4). Reads the session from the
 * request cookies so the proxy can gate routes on Supabase Auth. Separate from
 * server-client.ts because middleware uses `request.cookies`, not `next/headers`.
 *
 * Returns null when Supabase Auth isn't configured (public env unset) — the proxy
 * then falls back to the Clerk gate. Read-focused: getUser() validates the JWT
 * against the Supabase Auth server.
 *
 * NOTE (refinement): full session-refresh cookie propagation onto the proxy's many
 * response paths is a follow-up. getUser-based gating works on the current token;
 * once the proxy is simplified to the single-host model, refreshed cookies should be
 * written onto the outgoing response per the @supabase/ssr middleware pattern.
 */

import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createMiddlewareSupabase(
  request: NextRequest
): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Refresh-cookie propagation is handled when the proxy is simplified to the
        // single-host model; gating only needs to read the current session.
      },
    },
  });
}
