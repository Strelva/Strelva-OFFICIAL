/**
 * Supabase Auth callback (migration Phase 4) — the redirect target for OAuth
 * (Google) and magic-link sign-in. Exchanges the `code` for a session, which the
 * @supabase/ssr cookie adapter persists, then redirects into the app.
 *
 * Replaces Clerk's hosted callback handling. Inert until the Supabase auth path is
 * configured (createUserClient() returns null) — so adding this route is safe while
 * the app still runs on Clerk.
 *
 * Supabase docs: guides/auth/server-side (code exchange in a Route Handler).
 */

import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/db/server-client";

export const dynamic = "force-dynamic";

/** Only allow same-origin relative redirects (no open-redirect via ?next=). */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createUserClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback`);
}
