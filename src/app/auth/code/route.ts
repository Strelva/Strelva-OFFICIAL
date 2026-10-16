/**
 * Email code sign-in. The same Supabase email that carries the sign-in link
 * can carry a short code ({{ .Token }}), so a person who reads mail on their
 * phone can sign in on their laptop. This route verifies the code and writes
 * the session cookies onto its own response, exactly as /auth/callback does
 * for the link, then tells the page where to continue.
 *
 * It never reveals whether an address has an account, never echoes provider
 * messages, and only continues to a same-origin relative path.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hostOnlyAuthCookieOptions } from "@/platform/infra/db/auth-cookie-options";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6,10}$/;

function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return "/account";
  return next;
}

function refuse(reason: "invalid" | "expired" | "rate_limited" | "unavailable", status: number) {
  return NextResponse.json({ ok: false, reason }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown; next?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!EMAIL.test(email) || !CODE.test(code)) return refuse("invalid", 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return refuse("unavailable", 503);

  const next = safeNext(body?.next);
  const response = NextResponse.json({ ok: true, next }, { headers: { "Cache-Control": "no-store" } });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, hostOnlyAuthCookieOptions(options));
      },
    },
  });

  try {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (!error) return response;
    if (error.status === 429 || error.code === "over_request_rate_limit") return refuse("rate_limited", 429);
    if (error.code === "otp_expired") return refuse("expired", 400);
    return refuse("invalid", 400);
  } catch {
    return refuse("unavailable", 503);
  }
}
