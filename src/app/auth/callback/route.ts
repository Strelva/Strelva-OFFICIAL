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
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!code || !url || !key) {
    console.error("[auth/callback] missing code/env", { hasCode: !!code, hasUrl: !!url, hasKey: !!key });
    return NextResponse.redirect(`${origin}/sign-in?error=auth_callback`);
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
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/sign-in?error=auth_callback`);
  }

  return response;
}
