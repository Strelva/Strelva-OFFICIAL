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
 */

// Commerce flow + rewards are managed by the repo, not AI-editable content.
const CUSTOM_ONLY_FEATURES = ["cart", "checkout", "rewards"];

export const dynamic = "force-static";

export function GET() {
  const manifest = buildSiteCapabilityManifest(Object.keys(defaults), {
    customOnlyFeatures: CUSTOM_ONLY_FEATURES,
  });
  return NextResponse.json(manifest);
}
