import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/server-client";
import { withClientFallbackRoot } from "@/lib/client-fallback";
import { resolveTenantOwnerEntry, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { decideOwnerEntry, entryDestination, routeDashboardRequest, type DashboardRouting, type OwnerEntryDecision } from "./decision";
import { ownerEntryPossible } from "./env";
import { effectiveDisposition, routeForDashboardPath, type DispositionGate } from "./dispositions";

/**
 * The trusted path the proxy saw for a `/dashboard` request, query included.
 * The proxy strips any client-supplied copy before it sets this.
 */
export const DASHBOARD_PATH_HEADER = "x-strelva-dashboard-path";

/** One read per request, shared by the layout and a ready page. */
export const ownerEntryForTenant = cache(async (tenant: string): Promise<OwnerEntryDecision> => {
  if (!ownerEntryPossible()) return { kind: "dashboard", reason: "env_off" };
  if (tenant === "demo") return { kind: "dashboard", reason: "demo" };
  try {
    const user = await getSessionUser();
    if (!user?.id || !user.email || !user.email_confirmed_at) return { kind: "dashboard", reason: "signed_out" };
    const resolution = await resolveTenantOwnerEntry(tenant, { userId: user.id, verifiedEmail: user.email });
    return decideOwnerEntry({ resolution });
  } catch (error) {
    // Fails toward the old surface (spec §8), and says so.
    console.error("[owner-entry] resolution failed; staying on /dashboard", { tenant, error: error instanceof Error ? error.message : String(error) });
    return { kind: "dashboard", reason: "unavailable" };
  }
});

/** The routing for this request's `/dashboard` path. */
export async function dashboardRoutingFor(tenant: string, pathWithSearch?: string): Promise<DashboardRouting> {
  const decision = await ownerEntryForTenant(tenant);
  if (decision.kind !== "workspace") return { kind: "render" };
  const path = pathWithSearch ?? (await headers()).get(DASHBOARD_PATH_HEADER) ?? "/dashboard";
  const entry = effectiveDisposition(routeForDashboardPath(new URL(path, "https://dashboard.invalid").pathname));
  const flags = new Map<DispositionGate, boolean>();
  for (const flag of entry.requires ?? []) {
    flags.set(flag, flag === "needs_you"
      ? needsYouReleaseEnabled()
      : await workspaceReleaseFlagEnabled(flag, decision.workspaceId, { operator: decision.operator, tester: decision.tester }).catch(() => false));
  }
  return routeDashboardRequest({ decision, pathWithSearch: path, flagOn: (flag) => flags.get(flag) === true });
}

/**
 * Called by a `ready` page for its own route, so a soft navigation (which
 * doesn't re-render the layout) redirects too. Keeps the page's query.
 */
export async function redirectIfDashboardPageMoved(tenant: string, route: string): Promise<void> {
  const requestHeaders = await headers();
  const seen = requestHeaders.get(DASHBOARD_PATH_HEADER);
  const search = seen ? new URL(seen, "https://dashboard.invalid").search : "";
  const routing = await dashboardRoutingFor(tenant, `/dashboard${route === "/" ? "" : route}${search}`);
  if (routing.kind === "redirect") redirect(routing.location);
}

/** Where a signed-in person lands after sign-in on this tenant's admin host. */
export async function ownerEntryLanding(tenant: string, clientFallbackRoot: string): Promise<string> {
  return entryDestination(await ownerEntryForTenant(tenant), withClientFallbackRoot(clientFallbackRoot, "/dashboard"));
}

