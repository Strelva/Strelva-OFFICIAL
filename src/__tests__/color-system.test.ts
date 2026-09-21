import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(css|tsx?)$/.test(path) ? [path] : [];
  });
}

describe("color system", () => {
  it("resolves CSS custom properties from a declaration, explicit fallback, or runtime contract", () => {
    const files = sourceFiles("src").filter(path => !path.includes("/__tests__/"));
    const source = files.map(path => readFileSync(path, "utf8")).join("\n");
    const declarations = new Set([...source.matchAll(/["']?(--[\w-]+)["']?\s*:/g)].map(match => match[1]));
    // Next font variables and dimensions set by JavaScript at runtime.
    const runtime = new Set(["--font-body", "--font-display", "--app-frame-height", "--i", "--motion-delay", "--pct"]);
    const missing: string[] = [];
    for (const path of files.filter(path => path.endsWith(".css"))) {
      for (const match of readFileSync(path, "utf8").matchAll(/var\((--[\w-]+)\s*([,)])/g)) {
        if (match[2] !== "," && !declarations.has(match[1]!) && !runtime.has(match[1]!)) missing.push(`${path}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps current Home and navigation colors in the shared palette", () => {
    const paths = [
      "src/experience/workspace/business-home.module.css",
      "src/experience/app-frame/strelva-sidebar.module.css",
      "src/experience/workspace/workspace-allowance.module.css",
      "src/experience/workspace/workspace-offerings.module.css",
    ];
    for (const path of paths) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/i);
    }
  });
});
