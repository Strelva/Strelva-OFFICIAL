import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseFlagsPanel } from "@/app/admin/clients/[id]/ReleaseFlagsPanel";
import { OperatorControlsPanel } from "@/app/admin/clients/[id]/OperatorControlsPanel";
import type { TenantReleaseState } from "@/platform/owner-entry/operator";

const linked: TenantReleaseState = {
  linked: true, tenantId: "preview-business", workspaceId: "11111111-1111-4111-8111-111111111111", workspaceRelease: true,
  flags: [{ flag: "owner_entry", label: "Owner entry", envName: "STRELVA_OWNER_ENTRY", envMode: "workspace", row: "operators", revision: 4, effective: "operators" }],
  testerEmails: [], history: [], ownerEntryBlockers: [{ route: "/site", home: "Website", note: "Check the owner's page first." }],
};

describe("operator release presentation", () => {
  it("keeps the four release states and owner-entry blockers, with changes disabled until a reason is present", () => {
    const html = renderToStaticMarkup(createElement(ReleaseFlagsPanel, { tenantId: "preview-business", initialState: linked }));
    expect(html).toContain("Operators and testers");
    for (const label of ["Follow global", "Off", "Operators", "On"]) expect(html).toContain(`>${label}</button>`);
    expect(html).toContain("Check the owner&#x27;s page first.");
    expect(html).toContain("Write a reason to enable changes.");
    expect(html).toMatch(/role="switch"[^>]*aria-label="Owner sign-in"[^>]*disabled=""/);
    expect(html).toMatch(/role="switch"[^>]*aria-label="Owner emails"[^>]*aria-checked="false"[^>]*disabled=""/);
  });

  it("does not offer per-client switches before conversion and keeps email off", () => {
    const html = renderToStaticMarkup(createElement(ReleaseFlagsPanel, { tenantId: "preview-business", initialState: { linked: false, tenantId: "preview-business" } }));
    expect(html).toContain("no per-client flags");
    expect(html).not.toContain("Reason for the next change");
    expect(html).toContain("Owner emails are off globally during rollout.");
  });

  it("retains a recorded client email override while preventing force-on during rollout", () => {
    const html = renderToStaticMarkup(createElement(OperatorControlsPanel, {
      tenantId: "preview-business", globalClientEmailPaused: true,
      initial: { reportCadence: "monthly", replyMode: "approve", contentAutonomy: "approve", clientEmail: "on", autoApproveThreshold: null, googlePlaceId: "", yelpBusinessId: "", visibilityTrade: "", visibilityTowns: "" },
    }));
    expect(html).toContain("Additional client settings");
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*disabled=""[^>]*>On<\/button>/);
    expect(html).toContain("Owner emails are off globally during rollout.");
    expect(html).not.toContain("AI content");
    expect(html).not.toContain("Force ON");
  });
});
