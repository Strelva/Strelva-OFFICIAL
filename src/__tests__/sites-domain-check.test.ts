import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function check(app: string, sites: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/check-site-domains.ts"], {
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_APP_ROOT_DOMAIN: app, NEXT_PUBLIC_SITES_ROOT_DOMAIN: sites },
  });
}

describe("hosted-site domain config check", () => {
  it("accepts omitted roots and a separate bare sites domain", () => {
    const configurations: Array<[string, string]> = [["", ""], ["app-root.example", " SITES.EXAMPLE "]];
    for (const [app, sites] of configurations) {
      const result = check(app, sites);
      expect(result.status, result.stderr).toBe(0);
    }
  });

  it.each(["https://sites.example", "sites.example/path", "sites.example:443", "*.sites.example"])("fails the command for malformed root %s", value => {
    const configurations: Array<[string, string]> = [["", value], [value, ""]];
    for (const [app, sites] of configurations) {
      const result = check(app, sites);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("bare DNS domain");
    }
  });
});
