import { describe, expect, it } from "vitest";
import { businessDetailsPatch, detailText } from "@/platform/business-record/details";
import type { BusinessRecord } from "@/platform/business-record/contracts";

function record(facts: Record<string, unknown> = {}): BusinessRecord {
  return {
    revision: 3, access: "owner",
    facts: Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, { value, source: "owner", verified: true }])),
    services: [], people: [],
  } as unknown as BusinessRecord;
}

describe("insurance plans in Business details", () => {
  it("parses one plan per line, dropping blanks and repeats in any case", () => {
    const result = businessDetailsPatch(record(), { insurance_accepted: "  Delta Dental PPO \n\n cigna\r\nCIGNA\nAetna  " });
    expect(result).toEqual({ kind: "patch", facts: { insurance_accepted: { value: { carriers: ["Delta Dental PPO", "cigna", "Aetna"] } } } });
  });

  it("keeps a prior summary when the list changes", () => {
    const result = businessDetailsPatch(record({ insurance_accepted: { carriers: ["Cigna"], summary: "Ask us." } }), { insurance_accepted: "Cigna\nAetna" });
    expect(result).toEqual({ kind: "patch", facts: { insurance_accepted: { value: { carriers: ["Cigna", "Aetna"], summary: "Ask us." } } } });
  });

  it("removes the fact when the box is emptied, and does nothing when it was already empty", () => {
    expect(businessDetailsPatch(record({ insurance_accepted: { carriers: ["Cigna"] } }), { insurance_accepted: " \n " })).toEqual({ kind: "patch", facts: { insurance_accepted: null } });
    expect(businessDetailsPatch(record(), { insurance_accepted: "" })).toEqual({ kind: "unchanged" });
  });

  it("round-trips through detailText and reports no change when untouched", () => {
    const current = record({ insurance_accepted: { carriers: ["Delta Dental PPO", "Cigna"] } });
    expect(detailText(current, "insurance_accepted")).toBe("Delta Dental PPO\nCigna");
    expect(businessDetailsPatch(current, { insurance_accepted: "Delta Dental PPO\nCigna" })).toEqual({ kind: "unchanged" });
  });

  it("refuses more than 60 plans and long names with a plain message", () => {
    const tooMany = Array.from({ length: 61 }, (_, i) => `Plan ${i}`).join("\n");
    expect(businessDetailsPatch(record(), { insurance_accepted: tooMany })).toEqual({ kind: "invalid", field: "insurance_accepted", message: "List up to 60 plans, one per line, each under 120 characters." });
    expect(businessDetailsPatch(record(), { insurance_accepted: "x".repeat(121) })).toMatchObject({ kind: "invalid", field: "insurance_accepted" });
  });

  it("leaves the field alone when the form does not send it (flag off)", () => {
    expect(businessDetailsPatch(record(), { phone: "716-555-0100" })).toMatchObject({ kind: "patch", facts: { phone: expect.anything() } });
  });
});
