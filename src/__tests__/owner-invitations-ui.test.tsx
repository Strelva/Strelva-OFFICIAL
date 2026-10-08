import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OwnerInvitationsPanel } from "@/app/admin/clients/[id]/OwnerInvitationsPanel";
import { ownerInvitationPreviewLoad, ownerInvitationPreviewRequest } from "@/app/preview/strelva/owner-invitations/fixture";

describe("operator owner invitations presentation", () => {
  it("renders explicit approval with email sending and preparation disabled until selected", () => {
    const html = renderToStaticMarkup(createElement(OwnerInvitationsPanel, { tenantId: "preview-business", load: ownerInvitationPreviewLoad() }));
    expect(html).toContain("owner@example.test");
    expect(html).toContain("Jacob approved an owner invitation for this business and this address.");
    expect(html).toContain("Preparing a link sends no email.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Prepare invitation link<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Email invitation<\/button>/);
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

  for (const delivery of ["suppressed", "failed"]) {
    it(`the browser fixture exercises ${delivery} recovery without making network calls`, async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in fixture"));
      try {
        const response = await ownerInvitationPreviewRequest(delivery)("/api/admin/tenants/preview-business/owner-invitations", {
          method: "POST", body: JSON.stringify({ action: "invite", recipientEmail: "owner@example.test", jacobApproved: true, sendEmail: true }),
        });
        expect(await response.json()).toMatchObject({ delivery: { status: "not_sent" }, acceptUrl: expect.stringContaining("/workspace/invitations/accept/") });
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally { fetchSpy.mockRestore(); }
    });
  }
});
