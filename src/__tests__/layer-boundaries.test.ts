import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIB_IMPORTS_WORKSPACE, WORKSPACE_IMPORTS_LIB, checkLayerBoundaries } from "../../scripts/layer-boundaries";
import { compareWithBaseline, pruneBaseline, type BoundaryBaseline } from "../../scripts/boundary-baseline";
import type { BoundaryViolation } from "../../scripts/product-boundaries";

// Strelva Reborn section 7: src/lib never imports a workspace layer; a
// workspace layer's src/lib imports only shrink (scripts/boundary-baseline.json).

describe("src/lib -> workspace imports", () => {
  it("are refused in every form: static, type-only, re-export, dynamic, relative", () => {
    const found = checkLayerBoundaries("src/lib/leads.ts", `
      import { a } from "@/platform/business-record/service";
      import type { B } from "@/products/inquiries/contracts";
      export { c } from "@/experience/places/WorkspaceInquiries";
      const d = await import("@/server/capabilities");
      type E = import("@/platform/workspaces/types").WorkspaceActor;
      import { f } from "../platform/needs-you/release";
    `);
    expect(found.map((v) => v.rule)).toEqual(Array(6).fill(LIB_IMPORTS_WORKSPACE));
  });

  it("allow shared infrastructure and other src/lib modules", () => {
    expect(checkLayerBoundaries("src/lib/leads.ts", `
      import { getRedis } from "@/platform/infra/redis";
      import { getSupabase } from "../platform/infra/db/client";
      import { getTenantConfig } from "./tenants";
      import { z } from "zod";
    `)).toEqual([]);
  });

  it("can never be baselined", () => {
    const [violation] = checkLayerBoundaries("src/lib/leads.ts", `import { a } from "@/products/inquiries/server";`);
    const baseline: BoundaryBaseline = { boundaries: [], workspaceImportsLib: { "src/lib/leads.ts": ["src/products/inquiries/server"] } };
    expect(compareWithBaseline(baseline, [], [violation!]).failures).toHaveLength(1);
  });
});

describe("workspace -> src/lib imports", () => {
  it("are flagged from every workspace layer, shared infrastructure included", () => {
    for (const file of ["src/platform/bookings/store.ts", "src/products/websites/server.ts", "src/experience/places/X.tsx", "src/server/capabilities.ts", "src/platform/infra/auth.ts"]) {
      const found = checkLayerBoundaries(file, `import { getTenantConfig } from "@/lib/tenants";`);
      expect(found, file).toHaveLength(1);
      expect(found[0]).toMatchObject({ rule: WORKSPACE_IMPORTS_LIB, target: "src/lib/tenants" });
    }
  });

  it("an old shim path is still a src/lib import", () => {
    expect(checkLayerBoundaries("src/platform/x.ts", `import { getRedis } from "@/lib/redis";`)).toHaveLength(1);
    expect(checkLayerBoundaries("src/platform/x.ts", `import { getRedis } from "@/platform/infra/redis";`)).toEqual([]);
  });

  it("routes, components, tests and the app edge are outside the rule", () => {
    for (const file of ["src/app/api/x/route.ts", "src/components/A.tsx", "src/__tests__/a.test.ts", "src/register-workspace-ports.ts", "scripts/x.ts"]) {
      expect(checkLayerBoundaries(file, `import { a } from "@/lib/tenants"; import { b } from "@/products/inquiries";`), file).toEqual([]);
    }
  });
});

describe("the shrink-only baseline", () => {
  const layer = checkLayerBoundaries("src/platform/a.ts", `import { t } from "@/lib/tenants"; import { u } from "@/lib/types";`);
  const old: BoundaryViolation = { file: "src/app/x.ts", line: 3, importPath: "@/products/a/internal", reason: "Import a product through its index." };

  it("passes what it lists and fails anything new", () => {
    const baseline: BoundaryBaseline = { boundaries: ["src/app/x.ts -> @/products/a/internal :: Import a product through its index."], workspaceImportsLib: { "src/platform/a.ts": ["src/lib/tenants"] } };
    const result = compareWithBaseline(baseline, [old], layer);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ target: "src/lib/types" });
    expect(result.stale).toEqual([]);
  });

  it("an entry that no longer occurs fails until it is pruned; prune never adds", () => {
    const baseline: BoundaryBaseline = {
      boundaries: ["src/app/gone.ts -> @/products/a/internal :: Import a product through its index."],
      workspaceImportsLib: { "src/platform/a.ts": ["src/lib/tenants", "src/lib/types", "src/lib/leads"], "src/platform/gone.ts": ["src/lib/tenants"] },
    };
    const result = compareWithBaseline(baseline, [], layer);
    expect(result.failures).toEqual([]);
    expect(result.stale).toHaveLength(3);
    const pruned = pruneBaseline(baseline, [], layer);
    expect(pruned.removed).toBe(3);
    expect(pruned.baseline.workspaceImportsLib).toEqual({ "src/platform/a.ts": ["src/lib/tenants", "src/lib/types"] });
    expect(pruned.baseline.boundaries).toEqual([]);
    expect(compareWithBaseline(pruned.baseline, [], layer)).toMatchObject({ failures: [], stale: [] });
    // A new import is not added by pruning.
    const more = checkLayerBoundaries("src/platform/a.ts", `import { l } from "@/lib/leads";`);
    expect(pruneBaseline(pruned.baseline, [], [...layer, ...more]).baseline.workspaceImportsLib["src/platform/a.ts"]).toEqual(["src/lib/tenants", "src/lib/types"]);
  });

  it("the committed baseline lists no src/lib file and lets nothing into src/lib", () => {
    const baseline = JSON.parse(readFileSync("scripts/boundary-baseline.json", "utf8")) as BoundaryBaseline;
    expect(Object.keys(baseline.workspaceImportsLib).filter((file) => file.startsWith("src/lib/"))).toEqual([]);
    for (const targets of Object.values(baseline.workspaceImportsLib)) {
      for (const target of targets) expect(target.startsWith("src/lib")).toBe(true);
    }
  });
});
