import { NextResponse, type NextRequest } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { INSPECT_COOKIE } from "@/lib/inspect-mode";

/**
 * Super-admin inspect-mode toggle. `?on=1` sets the intent cookie, `?on=0` clears
 * it, then redirects to a validated relative `to` path (defaults to /admin).
 *
 * SAFETY: super-admin is re-verified here — a non-super-admin gets 403 and the
 * cookie is never written. The cookie is intent only; every guarded request
 * re-checks isSuperAdmin() via isInspecting(). The `to` param is relative-path
 * only (no scheme, no protocol-relative "//") to prevent open redirects.
 */

/** Accept only a same-origin relative path; anything else falls back to /admin. */
function safeRelativePath(to: string | null): string {
  if (!to) return "/admin";
  // Must be a root-relative path, not protocol-relative ("//host") or a scheme.
  if (!to.startsWith("/") || to.startsWith("//") || to.includes("\\")) return "/admin";
  if (to.includes("://")) return "/admin";
  return to;
}

export async function GET(request: NextRequest) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const on = searchParams.get("on") === "1";
  const to = safeRelativePath(searchParams.get("to"));

  // The cookie is inspect INTENT only. It authorizes nothing: every enforcement
  // point re-checks isSuperAdmin() via isInspecting(). secure in prod is
  // defense-in-depth so the intent flag never rides an http request.
  const secure = process.env.NODE_ENV === "production";
  const response = NextResponse.redirect(new URL(to, request.url));
  if (on) {
    // Session cookie (no maxAge) — inspect intent ends when the browser closes.
    response.cookies.set(INSPECT_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    });
  } else {
    response.cookies.set(INSPECT_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
