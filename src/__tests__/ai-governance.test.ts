import { describe, expect, it } from "vitest";
import { decideAiContentGovernance } from "../lib/ai-governance";

describe("AI content governance", () => {
  it("requires review for high-risk factual business detail changes", () => {
    const decision = decideAiContentGovernance("contact", {
      phone: "555-123-4567",
      hours: "Mon-Fri 9-5",
    });

    expect(decision.action).toBe("review");
  });

  it("auto-publishes low-risk factual section changes", () => {
    const decision = decideAiContentGovernance("contact", {
      introNote: "Plenty of parking near the entrance.",
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

  // Adversarial / edge cases — the gate is security-critical (it's what stops the
  // AI from silently publishing wrong prices/addresses), so cover the ways a
  // high-risk change could try to slip past as low-risk.

  it("high-risk wins when mixed with low-risk fields in one change", () => {
    const decision = decideAiContentGovernance("contact", {
      introNote: "Plenty of parking near the entrance.",
      phone: "555-123-4567",
    });
    expect(decision.action).toBe("review");
  });

  it("normalizes field-name case + separators when matching high-risk hints", () => {
    // "BusinessAddress" -> "businessaddress" (contains "address"),
    // "owner_phone_number" -> "ownerphonenumber" (contains "phone").
    expect(decideAiContentGovernance("contact", { BusinessAddress: "123 Main St" }).action).toBe("review");
    expect(decideAiContentGovernance("contact", { owner_phone_number: "555" }).action).toBe("review");
  });

  it("catches a high-risk field nested inside an object/array", () => {
    const decision = decideAiContentGovernance("contact", {
      details: { card: { stripePaymentLink: "https://buy.stripe.com/x" } },
    });
    expect(decision.action).toBe("review");
  });

  it("blocks structural sections even when only low-risk-looking fields change", () => {
    expect(decideAiContentGovernance("theme", { introNote: "x" }).action).toBe("block");
    expect(decideAiContentGovernance("navigation", { label: "Home" }).action).toBe("block");
  });
});
