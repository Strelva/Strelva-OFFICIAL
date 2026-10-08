#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import manifest from "./release-safety/batches.json";
import { verifyReleaseInventory } from "./release-safety/inventory";

export const RELEASE_BATCHES = manifest.batches;
export const RELEASE_BASELINE = manifest.baseline;
export type ReleaseBatch = number | "H" | "7A" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22";
type ReleaseStep = { batch: ReleaseBatch; items: typeof RELEASE_BASELINE; qualification: "prepared" | "proposed"; manifestStatus: string | null };
function proposedStep(batch: "H" | "7A" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22"): ReleaseStep {
  const matches = manifest.proposed.filter(step => step.batch === batch);
  if (matches.length !== 1 || !matches[0]!.items.length) throw new Error(`Missing or duplicate packet step: ${batch}.`);
  const step = matches[0]!;
  return { batch, items: step.items, qualification: "proposed", manifestStatus: "status" in step ? step.status ?? null : null };
}
if (RELEASE_BATCHES.length !== 8) throw new Error("Prepared packet must contain batches 0–7.");
/** Reviewed application order; timestamps alone do not encode prerequisites. */
export const RELEASE_PACKET: ReleaseStep[] = [
  { batch: 0, items: RELEASE_BATCHES[0]!, qualification: "prepared", manifestStatus: null },
  proposedStep("H"),
  ...RELEASE_BATCHES.slice(1).map((items, index): ReleaseStep => ({ batch: index + 1, items, qualification: "prepared", manifestStatus: null })),
  proposedStep("7A"), proposedStep("8"), proposedStep("9"), proposedStep("10"), proposedStep("11"), proposedStep("12"), proposedStep("13"), proposedStep("14"), proposedStep("15"), proposedStep("16"), proposedStep("17"), proposedStep("18"), proposedStep("19"), proposedStep("20"), proposedStep("21"), proposedStep("22"),
];

/** Offline only. The history input is a freshly reviewed list, not a provider lookup. */
export function stageReleaseBatch(options: { repoRoot: string; out: string; batch: ReleaseBatch; appliedVersions: string[] }) {
  const { repoRoot, batch, appliedVersions } = options;
  const stepIndex = RELEASE_PACKET.findIndex(step => step.batch === batch);
  if (stepIndex < 0) throw new Error("Batch must be a number 0–7 or exactly H, 7A, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22.");
  const step = RELEASE_PACKET[stepIndex]!;
  const pending = step.items;
  const prior = [...RELEASE_BASELINE, ...RELEASE_PACKET.slice(0, stepIndex).flatMap(step => step.items)];
  const expected = prior.map(({ file }) => file.slice(0, 14)).sort();
  if (JSON.stringify([...appliedVersions].sort()) !== JSON.stringify(expected)) {
    throw new Error("Applied history must match the baseline and every earlier batch exactly; stop on missing prerequisites, drift or a partially applied batch.");
  }
  const files = [...prior, ...pending];
  const out = resolve(options.out);
  if (existsSync(out)) throw new Error("Output directory must be fresh; existing directories are never overwritten.");
  // Check the whole pinned inventory, including future steps, before writes.
  verifyReleaseInventory(repoRoot);
  for (const { file, sha256 } of files) {
    const bytes = readFileSync(join(repoRoot, "supabase/migrations", file));
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Digest mismatch: ${file}.`);
  }
  const config = readFileSync(join(repoRoot, "supabase/config.toml"));
  mkdirSync(join(out, "supabase/migrations"), { recursive: true, mode: 0o700 });
  writeFileSync(join(out, "supabase/config.toml"), config, { mode: 0o600 });
  for (const { file } of files) copyFileSync(join(repoRoot, "supabase/migrations", file), join(out, "supabase/migrations", file));
  const receipt = { batch, staged: files, pending: pending.map(({ file }) => file), requiredAppliedVersions: expected,
    packetOrder: RELEASE_PACKET.map(step => step.batch), qualification: step.qualification,
    manifestStatus: step.manifestStatus, deploymentAuthorized: false, networkAccess: false };
  writeFileSync(join(out, "batch-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 6 || args[0] !== "--batch" || args[2] !== "--applied-versions" || args[4] !== "--out") {
      throw new Error("Usage: pnpm exec tsx scripts/stage-release-batch.ts --batch <0–7|H|7A|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22> --applied-versions <json-array-file> --out <fresh-directory>");
    }
    const appliedVersions: unknown = JSON.parse(readFileSync(args[3]!, "utf8"));
    if (!Array.isArray(appliedVersions) || appliedVersions.some((v) => typeof v !== "string" || !/^\d{14}$/.test(v))) throw new Error("Applied versions must be a JSON array of 14-digit strings.");
    const batch = /^[0-7]$/.test(args[1]!) ? Number(args[1]) : args[1] as ReleaseBatch;
    const receipt = stageReleaseBatch({ repoRoot: dirname(dirname(resolve(process.argv[1]))), batch, appliedVersions, out: args[5]! });
    console.log(`Staged batch ${receipt.batch}: ${receipt.staged.length} files; exactly ${receipt.pending.length} pending. Qualification: ${receipt.qualification}. No network access or deployment authority. Review receipt and linked dry-run with --include-all before any push.`);
  } catch (error) {
    console.error(error instanceof Error && !("code" in error) ? error.message : "Cannot read or stage batch files.");
    process.exitCode = 1;
  }
}
