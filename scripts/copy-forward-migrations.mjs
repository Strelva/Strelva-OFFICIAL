#!/usr/bin/env node
import { copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readCandidateMigrations } from "./check-workspace-target.mjs";

export function copyForwardMigrations(source, destination) {
  // Validate everything before copying anything; a misnamed migration is fatal.
  const migrations = readCandidateMigrations(source);
  for (const { version, name } of migrations) {
    const filename = `${version}_${name}.sql`;
    copyFileSync(join(source, filename), join(destination, filename));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error("Required: source and destination migration directories.");
  copyForwardMigrations(process.argv[2], process.argv[3]);
}
