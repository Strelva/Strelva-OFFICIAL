import { describe, expect, it } from "vitest";
import { askSuggestions } from "@/platform/ask/suggestions";
import type { BusinessRecord } from "@/platform/business-record/contracts";

const record: BusinessRecord = {
  workspaceId: "11111111-1111-4111-8111-111111111111", access: "owner", revision: 1, lastSequence: 1, updatedAt: null,
  facts: {}, people: [], contactCount: 0,
  services: [{ id: "22222222-2222-4222-8222-222222222222", name: "Dental cleaning", active: true, verified: true, source: "owner", description: null, durationMinutes: null, priceText: null, position: 0, externalRef: null, updatedAt: "2026-10-14T12:00:00Z" }],
};
const fact = { source: "owner" as const, verified: true, updatedAt: "2026-10-14T12:00:00Z", updatedBy: "22222222-2222-4222-8222-222222222222" };

describe("business-grounded Ask suggestions", () => {
  it("uses the active verified service without inventing a new service or action", () => {
    const examples = askSuggestions({ record, businessName: "Harbor Dental" });
    expect(examples).toEqual(["What do you know about Harbor Dental?", "What changed for Harbor Dental this month?", "Draft a clearer explanation of our Dental cleaning service."]);
    expect(examples.join(" ")).not.toMatch(/estate planning|gift boxes|publish|approve/);
  });
  it.each([{ active: false }, { verified: false }])("does not recommend using an inactive or unverified service %s", change => {
    expect(askSuggestions({ record: { ...record, services: [{ ...record.services[0]!, ...change }] }, businessName: "Harbor Dental" })[2]).toBe("What business details should I add first?");
  });
  it("uses verified hours or description when no verified service is present", () => {
    expect(askSuggestions({ record: { ...record, services: [], facts: { hours: { ...fact, value: { timezone: "UTC", weekly: [] } } } } })[2]).toBe("What are our saved opening hours?");
    expect(askSuggestions({ record: { ...record, services: [], facts: { description: { ...fact, value: "Dental practice" } } } })[2]).toContain("using our saved facts");
  });
  it("has neutral bounded fallback prompts for missing facts and a selected System", () => {
    expect(askSuggestions({ aboutSystem: true, systemName: "Booking requests" }).slice(0, 2)).toEqual(["What does Booking requests do today?", "What could we improve about Booking requests?"]);
    expect(askSuggestions({ businessName: "Harbor\nDental" })[0]).toBe("What do you know about Harbor Dental?");
    expect(askSuggestions({ businessName: "x".repeat(1000) })[0]!.length).toBeLessThan(300);
  });
});
