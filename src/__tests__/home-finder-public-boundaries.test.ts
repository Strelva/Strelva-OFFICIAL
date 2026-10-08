import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localTarget, sourceImports, checkProductBoundaries } from "../../scripts/product-boundaries";
import { readHomeFinderBindings, requireHomeFinderEntry, getConfiguredHomeFinderAdapter } from "@/products/home-finder/server";
import { homeFinderBindingSchema } from "@/products/home-finder/contracts";

describe("Home Finder public composition", () => {
  it("exposes native server composition through the existing public server entry", () => {
    expect(typeof readHomeFinderBindings).toBe("function");
    expect(typeof requireHomeFinderEntry).toBe("function");
    expect(typeof getConfiguredHomeFinderAdapter).toBe("function");
    expect(homeFinderBindingSchema).toBeDefined();
  });
  it("keeps browser contracts transitively free of Node, storage and server entry dependencies", () => {
    const visited = new Set<string>();
    function inspect(file: string) {
      if (visited.has(file)) return;
      visited.add(file);
      for (const item of sourceImports(file, readFileSync(file, "utf8"))) {
        expect(item.specifier).not.toBeNull();
        const specifier = item.specifier!;
        const target = localTarget(file, specifier);
        if (!target) { expect(specifier).toBe("zod"); continue; }
        expect(target).not.toMatch(/(?:\/server$|\/runtime-server$|\/entry$|\/infra\/|\/runtime-adapter$)/);
        const next = [target + ".ts", target + ".tsx", target + "/index.ts"].find(existsSync);
        expect(next).toBeDefined();
        inspect(next!);
      }
    }
    inspect("src/products/home-finder/contracts.ts");
  });
  it("routes, experience and proxy import only public product entries", () => {
    for (const file of ["src/app/api/home-finder/[bindingId]/route.ts", "src/app/api/workspace/home-finder/route.ts", "src/app/home-finder/[bindingId]/page.tsx", "src/experience/enterprise/HomeFinder.tsx", "src/experience/enterprise/HomeFinderBuyer.tsx", "src/proxy.ts"]) expect(checkProductBoundaries(file, readFileSync(file, "utf8"))).toEqual([]);
  });
});
