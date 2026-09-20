import { describe, expect, it } from "vitest";
import { validateCustomBuild, customArtifactDigest } from "@/products/custom-applications/build";
import { CUSTOM_APPLICATION_CSP, CUSTOM_APPLICATION_PARENT_CSP, customApplicationSandboxHtml } from "@/products/custom-applications/client";

const input = { workspaceId: "11111111-1111-4111-8111-111111111111", resourceId: "22222222-2222-4222-8222-222222222222", applicationVersion: 1, files: { "build.mjs": "console.log('build');" } };
describe("isolated custom application construction", () => {
  it("accepts an exact resource and source, and refuses files outside the build", () => {
    expect(validateCustomBuild(input).applicationVersion).toBe(1);
    for (const path of ["../secret", "/etc/passwd", "nested/../../escape", "a\\b", "build.mjs\0x", ".env"]) {
      expect(() => validateCustomBuild({ ...input, files: { [path]: "value" } })).toThrow();
    }
    expect(() => validateCustomBuild({ ...input, files: { "index.html": "missing builder" } })).toThrow(/build.mjs/);
  });
  it("binds delivered bytes to the resource and released version", () => {
    const receipt = { ...input, html: "<!doctype html><title>Shift coverage</title>" };
    const original = customArtifactDigest(receipt);
    expect(customArtifactDigest({ ...receipt })).toBe(original);
    expect(customArtifactDigest({ ...receipt, applicationVersion: 2 })).not.toBe(original);
    expect(customArtifactDigest({ ...receipt, workspaceId: "33333333-3333-4333-8333-333333333333" })).not.toBe(original);
    expect(customArtifactDigest({ ...receipt, html: receipt.html + "Changed" })).not.toBe(original);
  });
  it("keeps local artifact interaction while fixing the recipient network boundary", () => {
    const wrapped = customApplicationSandboxHtml("<!doctype html><html><head><title>Local tool</title></head><body><button>Run</button><script>document.body.dataset.ready='yes'</script></body></html>");
    expect(wrapped).toContain(`content="${CUSTOM_APPLICATION_CSP}"`);
    expect(wrapped).toContain("<script>document.body.dataset.ready='yes'</script>");
    expect((wrapped.match(/Content-Security-Policy/g) ?? []).length).toBe(1);
    expect(customApplicationSandboxHtml("<main>Plain artifact</main>")).toMatch(new RegExp("<head>[\\s\\S]*Content-Security-Policy[\\s\\S]*</head>"));
    const earlyScript = "<script>document.body.dataset.early='yes'</script><main>Early artifact</main>";
    expect(customApplicationSandboxHtml(earlyScript).indexOf(`content="${CUSTOM_APPLICATION_CSP}"`)).toBeLessThan(customApplicationSandboxHtml(earlyScript).indexOf(earlyScript));
  });
  it("defines a scoped parent policy for released artifact frames", () => {
    expect(CUSTOM_APPLICATION_PARENT_CSP).toBe("frame-src 'none'");
  });
});
