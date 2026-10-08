import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "./batches.json";

/** Offline coverage: new integrated migrations cannot silently miss the packet. */
export function verifyReleaseInventory(root: string): void {
  const directory = join(root, "supabase/migrations");
  const items = [...manifest.baseline, ...manifest.batches.flat(), ...manifest.proposed.flatMap(batch => batch.items)];
  const names = new Set<string>();
  for (const item of items) {
    if (names.has(item.file)) throw new Error(`Duplicate release migration: ${item.file}`);
    names.add(item.file);
    if (createHash("sha256").update(readFileSync(join(directory, item.file))).digest("hex") !== item.sha256) throw new Error(`Release digest drift: ${item.file}`);
    if ("rollback" in item && (!existsSync(join(directory, item.rollback)) || item.rollback !== `rollback-${item.file}`)) throw new Error(`Missing or mismatched rollback: ${item.file}`);
  }
  const missing = readdirSync(directory).filter(file => /^\d{14}_.+\.sql$/.test(file) && !names.has(file));
  if (missing.length) throw new Error(`Migrations missing from the prepared packet: ${missing.sort().join(", ")}`);
}
