import { runLocalPinnedConsumerChecks } from "./custom-repo-pinned-check";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  runWorkspaceChecks,
  type WorkspaceManifest,
} from "./custom-repo-workspace-check";

const cwd = process.cwd();
const workspaceRoot = process.env.CUSTOM_REPO_WORKSPACE_ROOT
  ? path.resolve(process.env.CUSTOM_REPO_WORKSPACE_ROOT)
  : path.resolve(cwd, "..");
const manifestPath = path.join(cwd, "release-manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`Custom repo workspace check failed: missing ${manifestPath}`);
  process.exitCode = 1;
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as WorkspaceManifest;
  const localPinned = process.env.CUSTOM_REPO_MATERIALIZE_PINS === "1"
    ? runLocalPinnedConsumerChecks({ cwd, sourceRoot: process.env.CUSTOM_REPO_LOCAL_SOURCE_ROOT ?? workspaceRoot,
      outputParent: process.env.CUSTOM_REPO_PROOF_OUTPUT_ROOT })
    : null;
  if (localPinned) console.log(`Local pinned source receipt: ${localPinned.receiptPath}`);
  const results = localPinned?.results ?? runWorkspaceChecks(manifest, workspaceRoot, cwd, {
    verifyPins: process.env.CUSTOM_REPO_VERIFY_PINS === "1",
    checkoutRoot: process.env.CUSTOM_REPO_CHECKOUTS_ROOT
      ? path.resolve(process.env.CUSTOM_REPO_CHECKOUTS_ROOT)
      : undefined,
  });

  for (const result of results) {
    const status = result.skipped ? "SKIP" : result.ok ? "PASS" : "FAIL";
    const detail = result.detail ? ` - ${result.detail}` : "";
    console.log(`${status} ${result.name}${detail}`);
  }

  const failed = results.filter((result) => !result.ok);
  const skipped = results.filter((result) => result.skipped);
  if (failed.length > 0) {
    console.error(`Custom repo workspace check failed: ${failed.length}/${results.length} checks failed.`);
    process.exitCode = 1;
  } else {
    const passed = results.length - skipped.length;
    console.log(
      `Custom repo workspace check passed: ${passed}/${results.length} checks passed` +
        (skipped.length ? `, ${skipped.length} skipped (sibling repos not checked out).` : "."),
    );
  }
}
