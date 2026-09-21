import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonalAiAccessControl, isCurrentPersonalAiAccess } from "@/experience/operations/PersonalAiAccessControl";

const integration = {
  id: "11111111-1111-4111-8111-111111111111",
  workId: "22222222-2222-4222-8222-222222222222",
  grantId: "33333333-3333-4333-8333-333333333333",
  tokenPrefix: "sta_example",
  agentLabel: "Research assistant",
  scopes: ["read", "propose"] as Array<"read" | "propose">,
  expiresAt: "2026-09-22T12:00:00.000Z",
  createdAt: "2026-09-15T12:00:00.000Z",
  revokedAt: null,
  authority: "issuing_user" as const,
};

function render(canManage: boolean) {
  return renderToStaticMarkup(createElement(PersonalAiAccessControl, {
    workId: integration.workId,
    canManage,
    participationRevision: 0,
    hasContributions: false,
    onAuthorityChanged: () => undefined,
  }));
}

describe("personal AI access UI", () => {
  it("makes the exact-work limits explicit and defaults to seven-day read/propose access with no reported cost", () => {
    const html = render(true);
    expect(html).toContain("Use this work from your own AI");
    expect(html).toContain("Strelva does not connect or run the outside AI");
    expect(html).toContain("value=\"read_propose\" selected=\"\"");
    expect(html).toContain("value=\"7\" selected=\"\"");
    expect(html).toContain("name=\"budget\"");
    expect(html).toContain("value=\"0\"");
    expect(html).toContain("cannot publish, spend, contact people, or change the original work");
    expect(html).not.toContain("Claude");
    expect(html).not.toContain("Codex");
  });

  it("does not expose integration management to people who cannot manage the work", () => {
    expect(render(false)).toBe("");
  });

  it("treats expiry and revocation as inactive", () => {
    expect(isCurrentPersonalAiAccess(integration, Date.parse("2026-09-16T12:00:00.000Z"))).toBe(true);
    expect(isCurrentPersonalAiAccess(integration, Date.parse(integration.expiresAt))).toBe(false);
    expect(isCurrentPersonalAiAccess({ ...integration, revokedAt: "2026-09-16T12:00:00.000Z" }, Date.parse("2026-09-16T12:00:00.000Z"))).toBe(false);
  });
});
