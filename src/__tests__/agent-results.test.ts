import { describe, expect, it } from "vitest";
import { agentResultFromToolOutput, buildAgentResultContract } from "../lib/agent-results";

describe("agent result contract", () => {
  it("prefers published changes and preserves useful identifiers", () => {
    const result = buildAgentResultContract([
      { status: "queued", sectionIds: ["hero"], eventIds: ["evt_1"] },
      { status: "published", sectionIds: ["contact"] },
    ]);

    expect(result.status).toBe("published");
    expect(result.sectionIds).toEqual(["hero", "contact"]);
    expect(result.eventIds).toEqual(["evt_1"]);
    expect(result.receipt.title).toBe("Site updated");
    expect(result.receipt.nextAction).toBe("view_site");
  });

  it("keeps blocked and failed outcomes non-successful", () => {
    expect(buildAgentResultContract([{ status: "blocked", sectionIds: ["theme"] }]).status).toBe("blocked");
    expect(buildAgentResultContract([{ status: "failed", error: "bad schema" }]).status).toBe("failed");
  });

  it("normalizes annotated tool output", () => {
    expect(
      agentResultFromToolOutput({
        success: true,
        agentResultStatus: "queued",
        section: "hero",
        eventId: "evt_2",
        sourceProof: "Source: Site content",
      })
    ).toEqual({
      status: "queued",
      sectionIds: ["hero"],
      eventIds: ["evt_2"],
      message: undefined,
      error: undefined,
      sourceProof: "Source: Site content",
    });
  });

  it("builds approval receipts for queued AI changes", () => {
    const result = buildAgentResultContract([
      { status: "queued", sectionIds: ["services"], eventIds: ["evt_3"] },
    ]);

    expect(result.receipt).toEqual({
      title: "Ready for approval",
      detail: "The AI saved services as a controlled change in the approval queue.",
      proof: "Source: Site content and services section data",
      nextAction: "review_queue",
    });
  });
});
