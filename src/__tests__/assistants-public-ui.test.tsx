import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicBusinessProfile } from "@/experience/product/assistants/PublicBusinessProfile";
import { unknownVerification } from "@/platform/agent-channel/contracts";

const base = { confirmedAt: "2026-10-03T12:00:00Z", pageUrl: "https://app.example.test/biz/fictional" };
describe("published assistant profile", () => {
  it("keeps publication separate from domain and provider verification, and does not invent action permissions", () => {
    const html = renderToStaticMarkup(<PublicBusinessProfile {...base} facts={{ name: "Fictional business", verification: { ...unknownVerification, googleBusinessProfile: { linked: true, verified: null, url: null } } }} />);
    expect(html).toContain("No public business details have been confirmed yet.");
    expect(html).toContain("Its Google listing is linked, but Google hasn&#x27;t checked it yet.");
    expect(html).not.toContain("Domain control confirmed");
    expect(html).not.toContain("Provider verification confirmed");
    expect(html).not.toContain("POST /request");
    expect(html).not.toContain("Connect over MCP");
    expect(html).toContain('href="https://app.example.test/biz/fictional/llms.txt"');
  });
  it("shows confirmed policy provenance without turning those terms into booking or charging controls", () => {
    const html = renderToStaticMarkup(<PublicBusinessProfile {...base} facts={{ name: "Fictional business", policies: { deposit: { value: { required: true, percent: 20 }, source: "owner", updatedAt: "2026-10-09T00:00:00Z" } } }} />);
    expect(html).toContain("Deposit required. Amount: 20%.");
    expect(html).toContain("Fictional business confirmed this on Oct 9, 2026.");
    // No legal disclaimer in builder words; the policy is the business's own sentence.
    expect(html).not.toContain("booking enforcement");
    expect(html).not.toContain("Pay a deposit");
  });
  it("error and permission states omit supplied business facts and methods", () => {
    for (const state of ["error", "permission"] as const) {
      const html = renderToStaticMarkup(<PublicBusinessProfile {...base} state={state} facts={{ name: "WITHHELD_BUSINESS", social_links: ["https://withheld.example.test"] }} capabilities={[{ label: "WITHHELD_PERMISSION", detail: "Not available", method: "POST /request" }]} />);
      expect(html).toContain('role="alert"');
      expect(html).not.toContain("WITHHELD_BUSINESS");
      expect(html).not.toContain("WITHHELD_PERMISSION");
      expect(html).not.toContain("https://withheld.example.test");
    }
  });
});
