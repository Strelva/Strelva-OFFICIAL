import { describe, expect, it } from "vitest";
import { formatCatalog, formatWorkspace } from "../../scripts/app-releases";
import { BUILT_IN_APPS } from "@/platform/app-releases";

describe("pnpm app-releases", () => {
  it("prints every App with Release 1", () => {
    const text = formatCatalog();
    expect(text).toContain("Bookings · latest Release 1");
    for (const app of BUILT_IN_APPS) expect(text).toContain(`${app.name} · latest Release ${app.releases.length}`);
    expect(text).toContain("Release 2 listings_sync.google_fix · not shipped · gates: env STRELVA_LISTINGS_SYNC_GOOGLE_FIX=1");
    expect(text).toContain("Release 1 inquiries.baseline");
    expect(text).toContain("resend");
  });

  it("prints where a business stands", () => {
    const text = formatWorkspace([
      { appId: "bookings", available: true, release: 1, key: "bookings.baseline", latest: 2, heldBack: { number: 2, key: "bookings.x", gates: [{ kind: "workspace_flag", flag: "catalog_reports" }] }, requiredConnections: [] },
      { appId: "ask", available: false },
    ]);
    expect(text).toContain("Bookings Release 1 of 2 · held back at Bookings Release 2 by flag catalog_reports");
    expect(text).toContain("Ask Strelva · not available for this business");
  });
});
