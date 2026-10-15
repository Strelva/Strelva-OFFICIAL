import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("pricing copy", () => {
  it("never promises a price shown before paying while no price exists", () => {
    const offenders = sources(join(process.cwd(), "src")).filter((file) => readFileSync(file, "utf8").includes("Price shown before you pay"));
    expect(offenders).toEqual([]);
  });
});
