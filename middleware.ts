import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MARKETING_HOSTS = new Set([
  "reb.studio",
  "www.reb.studio",
  "localhost",
  "localhost:3000",
  "localhost:3001",
  "reb-studio.vercel.app",
]);

const isPublicRoute = createRouteMatcher([
  "/",
  "/agency",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboard(.*)",
  "/api/health",
  "/api/newsletter/subscribe",
  "/api/track",
  "/api/cron/(.*)",
  "/api/billing/webhook",
  "/api/sms/webhook",
  "/((?!api|dashboard|admin|studio).*)",
]);

const isCronRoute = createRouteMatcher(["/api/cron/(.*)"]);

function extractTenantFromHost(host: string): string | null {
  const hostWithoutPort = host.split(":")[0];

  if (MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(hostWithoutPort)) {
    return null;
  }

  if (hostWithoutPort.endsWith(".reb.studio")) {
    const subdomain = hostWithoutPort.replace(".reb.studio", "");
    if (subdomain && subdomain !== "www" && subdomain !== "admin") {
      return subdomain;
    }
    return null;
  }

  if (hostWithoutPort.endsWith(".vercel.app")) {
    return null;
  }

  return null;
}

async function resolveTenantFromCustomDomain(
  domain: string
): Promise<string | null> {
  try {
    const tenantsPath = process.cwd() + "/dev-tenants.json";
    const fs = await import("fs/promises");
    const raw = await fs.readFile(tenantsPath, "utf-8");
    const tenants = JSON.parse(raw) as Array<{
      id: string;
      customDomains?: string[];
    }>;

    for (const tenant of tenants) {
      if (tenant.customDomains?.includes(domain)) {
        return tenant.id;
      }
    }
  } catch {
    // File read failed, continue without custom domain mapping
  }
  return null;
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;

  if (isCronRoute(req)) {
    const cronSecret = req.headers.get("authorization")?.replace("Bearer ", "");
    if (cronSecret === process.env.CRON_SECRET || !process.env.CRON_SECRET) {
      return NextResponse.next();
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let tenantId = extractTenantFromHost(host);

  if (!tenantId) {
    const hostWithoutPort = host.split(":")[0];
    tenantId = await resolveTenantFromCustomDomain(hostWithoutPort);
  }

  if (tenantId) {
    const headers = new Headers(req.headers);
    headers.set("x-tenant", tenantId);

    const response = NextResponse.next({
      request: { headers },
    });

    return response;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
