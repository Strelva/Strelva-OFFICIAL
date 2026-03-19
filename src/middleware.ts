import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const DEFAULT_TENANT = "rohlax";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get("reb-admin-token")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

function extractTenant(request: NextRequest): string {
  // Dev fallback: ?tenant=carolee
  const paramTenant = request.nextUrl.searchParams.get("tenant");
  if (paramTenant) return paramTenant;

  // Subdomain extraction: carolee.reb.studio → carolee
  const host = request.headers.get("host") || "";
  const parts = host.split(".");
  // If 3+ parts (sub.domain.tld) and first part isn't "www"
  if (parts.length >= 3 && parts[0] !== "www") {
    return parts[0];
  }

  return DEFAULT_TENANT;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tenant = extractTenant(request);

  // Clone headers and inject tenant
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant", tenant);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (pathname === "/admin/login") {
    return response;
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
    const authed = await isAuthenticated(request);
    if (!authed) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return response;
  }

  if (
    pathname.startsWith("/api/content") ||
    pathname.startsWith("/api/upload") ||
    pathname.startsWith("/api/agent")
  ) {
    const authed = await isAuthenticated(request);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};
