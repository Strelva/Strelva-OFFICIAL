import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkProductBoundaries } from "./product-boundaries";
import { checkDomainDependencies } from "./domain-boundaries";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

const files = new Map(["src", "scripts"].flatMap(sources).map((file) => [file, readFileSync(file, "utf8")]));
const violations = [
  ...[...files].flatMap(([file, source]) => checkProductBoundaries(file, source)),
  ...checkDomainDependencies(files),
];
for (const violation of violations) {
  console.error(`${violation.file}:${violation.line} ${violation.reason} (${violation.importPath})`);
}
if (violations.length > 0) process.exitCode = 1;
else console.log("Product boundaries passed (source and scripts, including untracked files).");
