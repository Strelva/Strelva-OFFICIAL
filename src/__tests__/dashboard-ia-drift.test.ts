import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDashboardSurfaces, type SurfaceTenantConfig } from "@/lib/dashboard-surfaces";
import { SURFACE_MATCH } from "@/components/dashboard/surface-nav";
import type { Connection } from "@/lib/types";

// IA-drift / dead-link guard. The conditional nav is data-driven: a surface
// declares an href, the active-tab matcher declares route prefixes. Both must
// point at a real route, or a tab silently links to a 404. This fails the
// moment someone adds a surface/match route without the page (or renames a
// route out from under the nav). Type-level Record<SurfaceId, …> already
// guarantees every surface has an icon + match; this guards the runtime hrefs.

const APP = join(process.cwd(), "src/app");

/** "/dashboard" -> app/dashboard/page.tsx, "/dashboard/x" -> app/dashboard/x/page.tsx */
function routeHasPage(route: string): boolean {
  const rel = route.replace(/^\//, "");
  return (
    existsSync(join(APP, rel, "page.tsx")) ||
    existsSync(join(APP, rel, "page.ts"))
  );
}

// Permutations that exercise every conditional href the resolver can emit
// (commerce on/off, reviews ready vs connect-fallback, local vs online).
const CONFIGS: { tenantConfig: SurfaceTenantConfig; connections: Connection[] }[] = [
  { tenantConfig: { template: "wellness", features: ["commerce"], reviewsConfig: { googlePlaceId: "x" } }, connections: [] },
  { tenantConfig: { template: "food-brand", features: [] }, connections: [] },
  { tenantConfig: { template: "trades" }, connections: [] },
];

describe("dashboard IA-drift guard", () => {
  it("every resolvable surface href points at a real route page", () => {
    const hrefs = new Set<string>();
    for (const c of CONFIGS) {
      for (const s of getDashboardSurfaces(c)) hrefs.add(s.href);
    }
    const dead = [...hrefs].filter((h) => h.startsWith("/dashboard") && !routeHasPage(h));
    expect(dead, `surface hrefs with no page: ${dead.join(", ")}`).toEqual([]);
  });

  it("every active-tab match route has a real route page", () => {
    const dead = Object.values(SURFACE_MATCH)
      .flat()
      .filter((route) => !routeHasPage(route));
    expect(dead, `SURFACE_MATCH routes with no page: ${dead.join(", ")}`).toEqual([]);
  });
});
