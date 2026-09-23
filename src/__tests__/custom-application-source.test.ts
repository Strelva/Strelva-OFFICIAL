import { afterEach, describe, expect, it, vi } from "vitest";
import { customApplicationFilesSchema, CUSTOM_APPLICATION_SOURCE_BYTES } from "@/products/custom-applications/contracts";
import { validateCustomBuild } from "@/products/custom-applications/build";

const build = { workspaceId: "11111111-1111-4111-8111-111111111111", resourceId: "22222222-2222-4222-8222-222222222222", applicationVersion: 1 };
afterEach(() => vi.unstubAllGlobals());

describe("shared custom application source validation", () => {
  it("validates source in browsers without Node's Buffer global", () => {
    vi.stubGlobal("Buffer", undefined);
    expect(customApplicationFilesSchema.parse({ "build.mjs": "// café" })).toEqual({ "build.mjs": "// café" });
  });

  it("counts UTF-8 bytes instead of JavaScript characters at the exact limit", () => {
    const accepted = { "build.mjs": "é".repeat(CUSTOM_APPLICATION_SOURCE_BYTES / 2) };
    const rejected = { "build.mjs": accepted["build.mjs"] + "é" };
    expect(customApplicationFilesSchema.safeParse(accepted).success).toBe(true);
    expect(customApplicationFilesSchema.safeParse(rejected).success).toBe(false);
    expect(validateCustomBuild({ ...build, files: accepted }).files).toEqual(accepted);
    expect(() => validateCustomBuild({ ...build, files: rejected })).toThrow();
  });

  it.each(["../secret", "/etc/passwd", "nested/../secret", "a//b", "a\\b", ".env"])("rejects %s in both intake and build", (path) => {
    const files = { "build.mjs": "", [path]: "source" };
    expect(customApplicationFilesSchema.safeParse(files).success).toBe(false);
    expect(() => validateCustomBuild({ ...build, files })).toThrow();
  });

  it("counts the combined source and requires the build entry in both boundaries", () => {
    for (const files of [{ "index.html": "No build entry" }, { "build.mjs": "x".repeat(CUSTOM_APPLICATION_SOURCE_BYTES), "other.js": "x" }]) {
      expect(customApplicationFilesSchema.safeParse(files).success).toBe(false);
      expect(() => validateCustomBuild({ ...build, files })).toThrow();
    }
  });
});
