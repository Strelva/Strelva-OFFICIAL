import { describe, expect, it } from "vitest";
import path from "node:path";
import ts from "typescript";
import { checkProductBoundaries } from "../../scripts/product-boundaries";

describe("product import boundaries", () => {
  it("typechecks owned source without absorbing independent applications", () => {
    const root = process.cwd();
    const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
    expect(config.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const files = parsed.fileNames.map((file) => path.relative(root, file));
    expect(files).toContain("src/app/api/agent/route.ts");
    expect(files).toContain("scripts/check-product-boundaries.ts");
    expect(files).toContain("src/__tests__/product-boundaries.test.ts");
    expect(files.some((file) => file.startsWith("strelva-marketing/"))).toBe(false);
    expect(files.some((file) => file.startsWith("client-prototypes/"))).toBe(false);
  });

  it("rejects platform dependencies on product internals and presentation", () => {
    expect(checkProductBoundaries("src/platform/accounts/status.ts", `
      import { score } from "@/products/ai-visibility/server";
      export { Page } from "../../app/page";
      type Composer = import("@/experience/conversation/composer").Composer;
    `)).toHaveLength(3);
  });

  it("rejects product-to-route dependencies, including dynamic imports", () => {
    expect(checkProductBoundaries("src/products/ai-visibility/score.ts", `
      const route = import("../../app/api/ai-visibility/route");
      const view = require("@/experience/conversation/view");
    `)).toHaveLength(2);
  });

  it("requires public product entry points for routes and other products", () => {
    for (const file of ["src/app/api/check/route.ts", "src/products/managed-presence/report.ts"]) {
      expect(checkProductBoundaries(file, `
        import { score } from "@/products/ai-visibility/score";
        import { run } from "@/products/ai-visibility/server";
        import type { Result } from "@/products/ai-visibility/contracts";
        import { format } from "@/products/ai-visibility";
      `)).toHaveLength(1);
    }
  });

  it("allows internal composition, shared infrastructure, and focused tests", () => {
    expect(checkProductBoundaries("src/products/ai-visibility/server.ts", `
      export { score } from "./score";
      import { identity } from "@/platform/identity";
      import { store } from "@/lib/redis";
    `)).toEqual([]);
    expect(checkProductBoundaries("src/__tests__/scoring.test.ts", `
      import { score } from "@/products/ai-visibility/score";
    `)).toEqual([]);
  });

  it("normalizes relative paths and does not confuse comments with imports", () => {
    const violations = checkProductBoundaries("src/platform/access/rules.ts", `
      // import { x } from "@/products/ai-visibility/score";
      import X = require("../../products/ai-visibility/score.js");
    `);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ line: 3, importPath: "../../products/ai-visibility/score.js" });
    expect(checkProductBoundaries("src/platform/access/rules.ts", `
      import { route } from "@/lib/../app/page";
    `)).toHaveLength(1);
  });

  it("keeps the native application domain independent of runtime adapters", () => {
    expect(checkProductBoundaries("src/products/applications/domain.ts", `
      import { getSupabase } from "@/lib/db/client";
      export { service } from "./server";
      const storage = import("./repository");
      const crypto = require("node:crypto");
      import type { Store } from "@/platform/bounded-work/repository";
    `)).toHaveLength(5);
    expect(checkProductBoundaries("src/products/applications/domain.ts", `
      import type { z } from "zod";
      import { applicationSchema } from "./contracts";
      import { isApplicationDateOnly } from "./date-only";
      import { WorkspaceConflictError } from "@/platform/workspaces/types";
    `)).toEqual([]);
  });

  it("prevents runtime dependencies from entering through shared domain contracts", () => {
    for (const file of [
      "src/products/applications/contracts.ts",
      "src/products/applications/date-only.ts",
      "src/platform/bounded-work/contracts.ts",
      "src/platform/workspaces/types.ts",
    ]) {
      expect(checkProductBoundaries(file, `
        export { client } from "@/lib/db/client";
      `)).toHaveLength(1);
    }
    expect(checkProductBoundaries("src/products/applications/contracts.ts", `
      import { z } from "zod";
      import { baseSchema } from "@/platform/bounded-work/contracts";
    `)).toEqual([]);
  });

  it("normalizes Windows file paths before applying boundaries", () => {
    expect(checkProductBoundaries("src\\products\\applications\\domain.ts", `
      import { storage } from "./repository";
    `)).toHaveLength(1);
    expect(checkProductBoundaries("./src/products/applications/domain.ts", `
      import { route } from "../../app/page";
    `)).toHaveLength(1);
  });

});
