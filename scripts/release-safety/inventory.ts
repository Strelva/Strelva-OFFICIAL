import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "./batches.json";

const MANUAL_ROLLBACKS: Record<string, string> = {
  "20261009160000_business_effort_coverage.sql": "rollback-business-effort-coverage.sql",
  "20261011100000_workspace_newsletter_sender.sql": "rollback-workspace-newsletter-sender.sql",
  "20261011100100_newsletter_backfill_identity.sql": "rollback-newsletter-backfill-identity.sql",
};

type ReleaseItem = { file: string; sha256: string; rollback?: string; rollbackKind?: string; rollbackSha256?: string };

/** Offline coverage: new integrated migrations cannot silently miss the packet. */
export function verifyReleaseInventory(root: string): void {
  const directory = join(root, "supabase/migrations");
  const forwardFiles = readdirSync(directory).filter(file => /^\d{14}_.+\.sql$/.test(file)).sort();
  const byVersion = new Map<string, string>();
  for (const file of forwardFiles) {
    const version = file.slice(0, 14);
    const prior = byVersion.get(version);
    if (prior) throw new Error(`Duplicate migration version ${version}: ${prior}, ${file}`);
    byVersion.set(version, file);
  }
  const items: ReleaseItem[] = [...manifest.baseline, ...manifest.batches.flat(), ...manifest.proposed.flatMap<ReleaseItem>(batch => batch.items)];
  const names = new Set<string>();
  for (const item of items) {
    if (names.has(item.file)) throw new Error(`Duplicate release migration: ${item.file}`);
    names.add(item.file);
    if (createHash("sha256").update(readFileSync(join(directory, item.file))).digest("hex") !== item.sha256) throw new Error(`Release digest drift: ${item.file}`);
    if (item.rollbackKind === "manual" && (MANUAL_ROLLBACKS[item.file] !== item.rollback || !item.rollbackSha256)) throw new Error(`Unpinned or unrecognized manual rollback: ${item.file}`);
    if (item.rollback && (!existsSync(join(directory, item.rollback)) || (item.rollback !== `rollback-${item.file}` && !(item.rollbackKind === "manual")))) throw new Error(`Missing or mismatched rollback: ${item.file}`);
  }
  for (const item of items) if (item.rollbackSha256 && item.rollback && createHash("sha256").update(readFileSync(join(directory, item.rollback))).digest("hex") !== item.rollbackSha256) throw new Error(`Manual rollback digest drift: ${item.file}`);
  const versions = new Map<string, string>();
  for (const item of items) {
    const version = item.file.slice(0, 14);
    if (versions.has(version)) throw new Error(`Duplicate release migration version ${version}: ${versions.get(version)}, ${item.file}`);
    versions.set(version, item.file);
  }
  const missing = forwardFiles.filter(file => !names.has(file));
  if (missing.length) throw new Error(`Migrations missing from the prepared packet: ${missing.sort().join(", ")}`);
}
