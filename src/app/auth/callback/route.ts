import { workspaceReturnTarget } from "@/lib/workspace-location";
/**
 * Supabase Auth callback (migration Phase 4) — redirect target for OAuth (Google)
 * and magic-link. Exchanges the `code` for a session and writes the session cookies
 * onto the OUTGOING redirect response so they actually persist.
 *
 * IMPORTANT: cookies must be set on the same NextResponse that is returned. Setting
 * them via next/headers and then returning a fresh NextResponse.redirect() drops
 * them (the earlier bug — exchange succeeded but the session cookie never stuck, so
 * the proxy gate bounced the user back to sign-in).
 *
 * Inert when the Supabase auth env is unset (local dev without Supabase).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

/** Only allow same-origin relative redirects (no open-redirect via ?next=). */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return "/account";
  return next;
}

/** Bounce back to sign-in with a short, URL-safe reason tag so a failed round-trip
 *  is diagnosable from the address bar (and logged) instead of an opaque error. */
function fail(origin: string, reason: string, next: string): NextResponse {
  const retryNext = workspaceReturnTarget(next) ? `&next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback&reason=${encodeURIComponent(reason)}${retryNext}`);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // The provider (Supabase/Google) can redirect back with an error instead of a
  // code (e.g. redirect-URL not allow-listed, consent denied). Surface it verbatim.
  const providerError = searchParams.get("error_description") || searchParams.get("error");
  if (providerError) {
    console.error("[auth/callback] provider returned error:", providerError);
    return fail(origin, `provider:${providerError.slice(0, 120)}`, next);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!code || !url || !key) {
    console.error("[auth/callback] missing code/env", { hasCode: !!code, hasUrl: !!url, hasKey: !!key });
    return fail(origin, !code ? "no_code" : "no_env", next);
  }

  // Build the success redirect first; the Supabase client writes session cookies
  // directly onto THIS response so they persist.
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // A double-hit on this route (prefetch, browser retry) consumes the code on the
    // first pass and this second pass fails "code already used" — but the first pass
    // already set the session cookie. If we already have a valid session, treat the
    // exchange failure as benign and continue to `next` rather than bouncing to sign-in.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      console.warn("[auth/callback] exchange failed but a session already exists (double-hit); continuing:", error.message);
      return response;
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return fail(origin, `exchange:${error.message.slice(0, 120)}`, next);
  }

  return response;
}
