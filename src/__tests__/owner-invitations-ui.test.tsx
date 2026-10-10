import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OwnerInvitationsPanel } from "@/app/admin/clients/[id]/OwnerInvitationsPanel";
import { ownerInvitationPreviewLoad, ownerInvitationPreviewRequest } from "@/app/preview/strelva/owner-invitations/fixture";

describe("operator owner invitations presentation", () => {
  it("shows the trusted-owner step-up path without browser approval controls or email delivery", () => {
    const html = renderToStaticMarkup(createElement(OwnerInvitationsPanel, { tenantId: "preview-business", load: ownerInvitationPreviewLoad() }));
    expect(html).toContain("owner@example.test");
    expect(html).toContain("trusted owner address");
    expect(html).toContain("sign-in from the last 10 minutes");
    expect(html).toContain("Email delivery remains disabled.");
    expect(html).not.toContain("jacobApproved");
    expect(html).not.toContain("Jacob approved");
    expect(html).not.toContain("Email invitation");
    expect(html).not.toContain("type=\"checkbox\"");
  });

  it("gives the second operator a small exact-address approval form for a non-trusted address", () => {
    const load = ownerInvitationPreviewLoad();
    if (load.kind !== "ready") throw new Error("expected ready preview");
    const untrusted = { ...load, state: { ...load.state, recipient: { email: "owner@example.test", name: null, from: "tenant_fallback" as const, source: null, verified: false } } };
    const html = renderToStaticMarkup(createElement(OwnerInvitationsPanel, { tenantId: "preview-business", load: untrusted }));
    expect(html).toContain("Approval ID from a different operator");
    expect(html).toContain("Record approval as this operator");
    expect(html).toContain("Use that ID while signed in as the issuing operator.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Prepare invitation link<\/button>/);
  });

  for (const [state, copy] of [
    ["owned", "This business already has an owner."], ["exited", "This business has left Strelva."],
    ["denied", "business admin membership is required."], ["unavailable", "Owner invitation state could not be read."],
    ["unconverted", "Convert this site to a business"], ["pending", "Revoke invitation"],
  ]) {
    it(`shows ${state} state without a second invite control`, () => {
      const html = renderToStaticMarkup(createElement(OwnerInvitationsPanel, { tenantId: "preview-business", load: ownerInvitationPreviewLoad(state) }));
      expect(html).toContain(copy);
      expect(html).not.toContain("Prepare invitation link");
      expect(html).not.toContain("Email invitation");
    });
  }

  it("uses only the synthetic preview transport and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in fixture"));
    try {
      const response = await ownerInvitationPreviewRequest()("/api/admin/tenants/preview-business/owner-invitations", {
        method: "POST", body: JSON.stringify({ action: "invite", recipientEmail: "owner@example.test" }),
      });
      expect(await response.json()).toMatchObject({ delivery: { status: "not_sent", reason: "email_not_requested" }, acceptUrl: expect.stringContaining("/workspace/invitations/accept/") });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
});
