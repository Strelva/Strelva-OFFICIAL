import { describe, expect, it } from "vitest";
import { checkDomainDependencies } from "../../scripts/domain-boundaries";

const root = "src/products/example/contracts.ts";
const check = (files: Record<string, string>) => checkDomainDependencies(new Map(Object.entries(files)));

describe("transitive domain dependencies", () => {
  it("checks providers hidden behind multiple shared re-exports", () => {
    const violations = check({
      [root]: 'export type { Contract } from "./shared";',
      "src/products/example/shared.ts": 'export * from "@/lib/example";',
      "src/lib/example.ts": 'import { generateText } from "ai";',
    });
    expect(violations).toEqual([expect.objectContaining({ file: "src/lib/example.ts", line: 1, importPath: "ai" })]);
  });

  it.each([
    'import type { Store } from "./repository";',
    'export { Page } from "@/experience/example";',
    'const db = import("@/lib/db/client");',
    'import Store = require("./server.js");',
    'type Service = import("./delivery-service").Service;',
  ])("rejects adapter dependencies: %s", (source) => {
    expect(check({ [root]: source })).toHaveLength(1);
  });

  it("resolves directory entries, js specifiers, aliases, Windows paths, and cycles", () => {
    expect(check({
      "src\\products\\example\\contracts.ts": 'export * from "./shared";',
      "src/products/example/shared/index.ts": 'export * from "../rules.js";',
      "src/products/example/rules.ts": 'import { z } from "zod"; export * from "@/products/example/contracts";',
    })).toEqual([]);
  });

  it("does not silently skip unresolved local modules", () => {
    expect(check({ [root]: 'import { missing } from "./missing";' })).toEqual([
      expect.objectContaining({ importPath: "./missing", reason: expect.stringContaining("could not be resolved") }),
    ]);
  });

  it.each(['import(name)', 'require(name)', 'require()', 'import(`./${name}`)'])("rejects uninspectable module loads: %s", (source) => {
    expect(check({ [root]: source })).toEqual([expect.objectContaining({ importPath: "<dynamic>" })]);
  });

  it("permits existing validation and identity primitives without scanning unrelated adapters", () => {
    expect(check({
      [root]: 'import { z } from "zod"; import { randomUUID } from "node:crypto";',
      "src/products/example/server.ts": 'import { createClient } from "@supabase/supabase-js";',
    })).toEqual([]);
  });

  it.each(["domain", "engine", "inquiry-engine"])("automatically covers a new product's %s", (name) => {
    expect(check({ [`src/products/new-product/${name}.ts`]: 'import { readFile } from "node:fs";' })).toHaveLength(1);
  });

  it("protects budget execution and governance rules as well as products", () => {
    expect(check({
      "src/platform/work-economics/execution-engine.ts": 'export * from "./repository";',
      "src/lib/ai-governance.ts": 'import Stripe from "stripe";',
    })).toHaveLength(2);
  });
});
