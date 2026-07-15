import { describe, expect, it } from "vitest";
import { resolveRepoChecks, workspaceContractVersion } from "../../scripts/custom-repo-workspace-check";

const manifest = {
  contractVersion: "v1",
  customRepoWorkspace: {
    contractVersion: "v1",
    baseline: {
      packageScripts: ["dev", "build", "check"],
      requiredFiles: ["README.md", "release-manifest.json"],
      requiredEnv: ["REB_API_URL"],
    },
    repos: [
      {
        tenant: "gldf",
        localPath: "../greatlakesdriedfruits",
        compatibleCommit: "abc123",
        packageScripts: ["check:prod"],
        requiredFiles: ["CLAUDE.md"],
        requiredEnv: ["REVALIDATE_SECRET"],
      },
      // A NEW starter-based repo: topology only, inherits the whole baseline.
      { tenant: "acme", localPath: "../acme-site", compatibleCommit: "def456" },
    ],
  },
};

describe("resolveRepoChecks — the workspace inventory is manifest-driven (#1)", () => {
  const checks = resolveRepoChecks(manifest, "/work", "/work/strelva-platform");

  it("merges baseline + per-repo extras (deduped) so a legacy repo keeps its specifics", () => {
    const gldf = checks.find((c) => c.tenant === "gldf")!;
    expect(gldf.packageScripts).toEqual(["dev", "build", "check", "check:prod"]);
    expect(gldf.requiredFiles).toEqual(["README.md", "release-manifest.json", "CLAUDE.md"]);
    expect(gldf.releaseRequiredEnv).toEqual(["REB_API_URL", "REVALIDATE_SECRET"]);
    expect(gldf.compatibleCommit).toBe("abc123");
  });

  it("a NEW repo with topology only inherits the full baseline — no code edit to onboard", () => {
    const acme = checks.find((c) => c.tenant === "acme")!;
    expect(acme.packageScripts).toEqual(["dev", "build", "check"]);
    expect(acme.requiredFiles).toEqual(["README.md", "release-manifest.json"]);
    expect(acme.releaseRequiredEnv).toEqual(["REB_API_URL"]);
    expect(acme.compatibleCommit).toBe("def456");
  });

  it("resolves repoDir relative to the workspace root", () => {
    expect(checks.find((c) => c.tenant === "acme")!.repoDir).toBe("acme-site");
  });

  it("throws on a repo entry missing its localPath (a malformed inventory)", () => {
    expect(() =>
      resolveRepoChecks({ customRepoWorkspace: { repos: [{ tenant: "x", localPath: "" }] } }, "/w", "/w/p"),
    ).toThrow(/localPath/);
  });

  it("falls back to the top-level contractVersion when the workspace block omits it", () => {
    expect(workspaceContractVersion(manifest)).toBe("v1");
    expect(workspaceContractVersion({ contractVersion: "v2", customRepoWorkspace: { repos: [] } })).toBe("v2");
  });
});
