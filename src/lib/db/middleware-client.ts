/**
 * Middleware/proxy Supabase client (migration Phase 4). Reads the session from the
 * request cookies so the proxy can gate routes on Supabase Auth. Separate from
 * server-client.ts because middleware uses `request.cookies`, not `next/headers`.
 *
 * Returns null when Supabase Auth isn't configured (public env unset) — the proxy
 * then falls back to the Clerk gate. Read-focused: getUser() validates the JWT
 * against the Supabase Auth server.
 *
 * Session refreshes may happen while `getUser()` validates the request. The cookie
 * adapter records response mutations against the request so whichever redirect,
 * rewrite, or pass-through response the proxy ultimately chooses can carry the
 * refreshed tokens and the accompanying no-cache headers.
 */

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type ResponseMutation = (response: NextResponse) => void;

const responseMutations = new WeakMap<NextRequest, ResponseMutation[]>();

/** Apply any auth-cookie refresh produced while validating this request. */
export function applyMiddlewareSupabaseResponse(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const mutations = responseMutations.get(request);
  if (!mutations) return response;

  for (const mutate of mutations) mutate(response);
  responseMutations.delete(request);
  return response;
}

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
      setAll(cookiesToSet, headersToSet) {
        // Keep the refreshed session visible to downstream request handling.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        const pending = responseMutations.get(request) ?? [];
        pending.push((response) => {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headersToSet)) {
            response.headers.set(name, value);
          }
        });
        responseMutations.set(request, pending);
      },
    },
  });
}
