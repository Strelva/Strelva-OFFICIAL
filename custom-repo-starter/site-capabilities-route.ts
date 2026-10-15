import { NextResponse } from "next/server";
import { defaults } from "./content-defaults";
import { buildSiteCapabilityManifest } from "./scaffold-client";

/**
 * Publishes THIS repo's capability manifest (B4). Drop in at
 * `app/api/capabilities/route.ts`, then point the tenant's
 * `customRepo.capabilityManifestUrl` (control plane, super-admin) at its public
 * URL. The control plane fetches + merges it, so the AI edits the sections this
 * LIVE site actually renders instead of the template's built-in default set.
 *
 * The section list is derived from `content-defaults` so it stays honest to
 * whatever this repo ships. Commerce (cart/checkout) and rewards are declared as
 * `customOnlyFeatures` — the AI requests those changes rather than editing them
 * directly. Adjust both for what your repo really mounts.
 *
 * It also declares where the site's content lives (`contentSource`) and the
 * commit it was built from (`release.commitSha`). `force-static` means both are
 * fixed per deploy, which is exactly the deployed commit. Strelva reads them to
 * decide whether content edits happen in Strelva or as code changes, and to
 * confirm a deploy a coding agent reports. Set `REB_CONTENT_SOURCE=strelva` only
 * if the site reads Strelva's v1 content API; otherwise leave it unset.
 */

// Commerce flow + rewards are managed by the repo, not AI-editable content.
const CUSTOM_ONLY_FEATURES = ["cart", "checkout", "rewards"];

export const dynamic = "force-static";

export function GET() {
  const manifest = buildSiteCapabilityManifest(Object.keys(defaults), {
    customOnlyFeatures: CUSTOM_ONLY_FEATURES,
    contentSource: process.env.REB_CONTENT_SOURCE === "strelva" ? "strelva" : "repo",
    release: { commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null, builtAt: new Date().toISOString() },
  });
  return NextResponse.json(manifest);
}
