import { describe, expect, it } from "vitest";
import { ASSISTANT_POLICIES, ASSISTANT_SURFACES, TEXT_PURPOSE_MAX_OUTPUT_TOKENS, assistantCallOptions } from "@/platform/infra/assistant-policy";

describe("assistant policy", () => {
  it("bounds every surface", () => {
    for (const surface of ASSISTANT_SURFACES) {
      const policy = ASSISTANT_POLICIES[surface];
      expect(policy.surface).toBe(surface);
      expect(policy.maxOutputTokens).toBeGreaterThan(0);
      expect(policy.maxOutputTokens).toBeLessThanOrEqual(8192);
      expect(policy.maxSteps).toBe(8);
    }
  });

  it("builds call options with an output limit and a step stop", () => {
    const options = assistantCallOptions(ASSISTANT_POLICIES.workspace_ask, { system: "s", messages: [], tools: {} });
    expect(options.maxOutputTokens).toBe(4096);
    expect(options.stopWhen).toBeDefined();
    expect(options.system).toBe("s");
  });

  it("limits single-shot text purposes", () => {
    for (const value of Object.values(TEXT_PURPOSE_MAX_OUTPUT_TOKENS)) {
      expect(Number.isInteger(value) && value > 0).toBe(true);
    }
  });
});
