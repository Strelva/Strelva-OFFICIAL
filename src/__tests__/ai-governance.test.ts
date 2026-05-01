import { describe, expect, it } from "vitest";
import { decideAiContentGovernance } from "../lib/ai-governance";

describe("AI content governance", () => {
  it("auto-publishes factual business detail changes", () => {
    const decision = decideAiContentGovernance("contact", {
      phone: "555-123-4567",
      hours: "Mon-Fri 9-5",
    });

    expect(decision.action).toBe("publish");
  });

  it("requires review for marketing copy changes", () => {
    const decision = decideAiContentGovernance("hero", {
      headline: "The best studio in town",
      tagline: "Feel better every day",
    });

    expect(decision.action).toBe("review");
  });

  it("blocks structural design and navigation changes", () => {
    const decision = decideAiContentGovernance("theme", {
      colors: { sage: "#000000" },
    });

    expect(decision.action).toBe("block");
  });

  it("respects tenant-level manual review mode", () => {
    const decision = decideAiContentGovernance(
      "contact",
      { phone: "555-123-4567" },
      { tenantAutoPublish: false }
    );

    expect(decision.action).toBe("review");
  });
});
