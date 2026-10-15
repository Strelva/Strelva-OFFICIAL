import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every user-facing "Coming soon" in src has an owning lane, so no lane has to
// re-derive the list. A new one anywhere else fails here: finish the feature,
// say what is true instead, or add the file below with the lane that owns it.
// Lanes delete their own rows as they finish. Tenant `comingSoon` content flags
// are not matched (no separator); "coming_soon" enum literals are.
//
//   money          payment links and checkout availability
//   connections    connection eligibility and Google Business states
//   agency-signup  agency signup and qualification gating copy
//   tenant-content template badges that render a client's own comingSoon flag
//   detector       audit and registry code that names the phrase to look for
const ALLOWED: Record<string, string> = {
  "src/app/(marketing)/agencies/page.tsx": "agency-signup",
  "src/app/(marketing)/home/page.tsx": "agency-signup",
  "src/app/admin/qualification/page.tsx": "agency-signup",
  "src/app/api/agency-qualification/route.ts": "agency-signup",
  "src/app/api/oauth/google/route.ts": "connections",
  "src/app/workspace/billing/page.tsx": "money",
  "src/components/dashboard/PropertiesEditor.tsx": "tenant-content",
  "src/components/dashboard/arrayFieldConfigs.ts": "tenant-content",
  "src/components/dashboard/templateFieldConfigs.ts": "tenant-content",
  "src/components/public/Services.tsx": "tenant-content",
  "src/components/public/Shop.tsx": "tenant-content",
  "src/components/templates/food-brand/ProductModal.tsx": "tenant-content",
  "src/components/templates/food-brand/Products.tsx": "tenant-content",
  "src/experience/connections/ConnectionsPreview.tsx": "connections",
  "src/experience/connections/WorkspaceConnections.tsx": "connections",
  "src/experience/connections/model.ts": "connections",
  "src/experience/places/GoogleConnect.tsx": "connections",
  "src/experience/systems/RequiredConnections.tsx": "connections",
  "src/experience/workspace/billing/AgencyCheckoutStatus.tsx": "money",
  "src/experience/workspace/billing/AgencyPaymentLinks.tsx": "money",
  "src/experience/workspace/billing/payment-links-server.ts": "money",
  "src/experience/workspace/leads/AgencyLeads.tsx": "money",
  "src/lib/audit/impact.ts": "detector",
  "src/lib/audit/modules/ai-readability.ts": "detector",
  "src/lib/features/registry.ts": "detector",
  "src/lib/integration-registry.ts": "detector",
  "src/platform/account-bindings/google-policy.ts": "connections",
  "src/platform/connect/checkout-availability.ts": "money",
  "src/platform/connections/README.md": "connections",
  "src/platform/connections/contracts.ts": "connections",
  "src/platform/connections/eligibility.ts": "connections",
  "src/products/google-listing/connect/agency.ts": "connections",
  "src/products/google-listing/native/oauth.ts": "connections",
  "src/products/google-listing/tenant-replies.ts": "connections",
};

const PATTERN = /coming[ _]soon/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      walk(full, out);
    } else if (!/\.test\.[a-z]+$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("coming-soon inventory", () => {
  const found = walk(path.join(process.cwd(), "src"))
    .filter((file) => PATTERN.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"))
    .sort();

  it("has an owning lane for every file that says coming soon", () => {
    const unowned = found.filter((file) => !(file in ALLOWED));
    expect(
      unowned,
      `New "Coming soon" copy in: ${unowned.join(", ")}. Say what is true instead, or add the file to ALLOWED with an owner lane.`,
    ).toEqual([]);
  });

  it("drops rows for files that no longer say it", () => {
    const stale = Object.keys(ALLOWED).filter((file) => !found.includes(file));
    expect(stale, `Remove from ALLOWED: ${stale.join(", ")}`).toEqual([]);
  });
});
