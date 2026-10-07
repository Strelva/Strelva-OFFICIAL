#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import manifest from "./release-safety/batches.json";

export const RELEASE_BATCHES = manifest.batches;
export const RELEASE_BASELINE = manifest.baseline;

/** Offline only. The history input is a freshly reviewed list, not a provider lookup. */
export function stageReleaseBatch(options: { repoRoot: string; out: string; batch: number; appliedVersions: string[] }) {
  const { repoRoot, batch, appliedVersions } = options;
  if (!Number.isInteger(batch) || batch < 0 || batch >= RELEASE_BATCHES.length) throw new Error("Batch must be 0–7.");
  const prior = [...RELEASE_BASELINE, ...RELEASE_BATCHES.slice(0, batch).flat()];
  const expected = prior.map(({ file }) => file.slice(0, 14)).sort();
  if (JSON.stringify([...appliedVersions].sort()) !== JSON.stringify(expected)) {
    throw new Error("Applied history must match the baseline and every earlier batch exactly; stop on missing prerequisites, drift or a partially applied batch.");
  }
  const files = [...prior, ...RELEASE_BATCHES[batch]];
  const out = resolve(options.out);
  if (existsSync(out)) throw new Error("Output directory must be fresh; existing directories are never overwritten.");
  for (const { file, sha256 } of files) {
    const bytes = readFileSync(join(repoRoot, "supabase/migrations", file));
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Digest mismatch: ${file}.`);
  }
  const config = readFileSync(join(repoRoot, "supabase/config.toml"));
  mkdirSync(join(out, "supabase/migrations"), { recursive: true, mode: 0o700 });
  writeFileSync(join(out, "supabase/config.toml"), config, { mode: 0o600 });
  for (const { file } of files) copyFileSync(join(repoRoot, "supabase/migrations", file), join(out, "supabase/migrations", file));
  const receipt = { batch, staged: files, pending: RELEASE_BATCHES[batch].map(({ file }) => file), networkAccess: false };
  writeFileSync(join(out, "batch-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 6 || args[0] !== "--batch" || args[2] !== "--applied-versions" || args[4] !== "--out") {
      throw new Error("Usage: pnpm exec tsx scripts/stage-release-batch.ts --batch <0–7> --applied-versions <json-array-file> --out <fresh-directory>");
    }
    const appliedVersions: unknown = JSON.parse(readFileSync(args[3], "utf8"));
    if (!Array.isArray(appliedVersions) || appliedVersions.some((v) => typeof v !== "string" || !/^\d{14}$/.test(v))) throw new Error("Applied versions must be a JSON array of 14-digit strings.");
    const receipt = stageReleaseBatch({ repoRoot: dirname(dirname(resolve(process.argv[1]))), batch: Number(args[1]), appliedVersions, out: args[5] });
    console.log(`Staged batch ${receipt.batch}: ${receipt.staged.length} files; exactly ${receipt.pending.length} pending. No network access. Review receipt and linked dry-run with --include-all before any push.`);
  } catch (error) {
    console.error(error instanceof Error && !("code" in error) ? error.message : "Cannot read or stage batch files.");
    process.exitCode = 1;
  }
}
