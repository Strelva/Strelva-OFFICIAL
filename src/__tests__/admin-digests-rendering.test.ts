import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/admin/digests/page.tsx"), "utf8");

describe("admin digest rendering", () => {
  it("requires a fresh request instead of statically prerendering operator data", () => {
    // Keep this literal export: Next must classify the page before evaluating
    // its request-scoped operator admission or reading pending digests.
    expect(page).toMatch(/^export const dynamic = ["']force-dynamic["'];$/m);
  });
  it("keeps durable operator admission before pending digest reads", () => {
    expect(page.indexOf('await authorizeAdminOperatorRead("admin.digests.read")')).toBeGreaterThan(0);
    expect(page.indexOf('await authorizeAdminOperatorRead("admin.digests.read")')).toBeLessThan(page.indexOf("await listPendingDigests()"));
  });
});
