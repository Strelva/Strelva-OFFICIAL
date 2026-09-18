import { describe, expect, it } from "vitest";
import {
  parseOperatorAllowanceCommand,
  WorkAllowanceValidationError,
} from "@/platform/work-economics/allowances-types";

const award = {
  action: "award_period",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  payerId: "22222222-2222-4222-8222-222222222222",
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-10-01T00:00:00.000Z",
  spendingCapCents: 0,
  grants: [{ unitKind: "completed_tracker_change", units: 3 }],
  idempotencyKey: "subscription-period-2026-09",
};

describe("work allowance contracts", () => {
  it("accepts an explicit zero-dollar operational cap with concrete units", () => {
    expect(parseOperatorAllowanceCommand(award)).toMatchObject({
      spendingCapCents: 0,
      grants: [{ unitKind: "completed_tracker_change", units: 3 }],
    });
  });

  it("rejects generic units, duplicate buckets and unlimited periods", () => {
    expect(() => parseOperatorAllowanceCommand({
      ...award,
      grants: [{ unitKind: "work_unit", units: 3 }],
    })).toThrow(WorkAllowanceValidationError);
    expect(() => parseOperatorAllowanceCommand({
      ...award,
      grants: [award.grants[0], award.grants[0]],
    })).toThrow("period or unit grants");
    expect(() => parseOperatorAllowanceCommand({
      ...award,
      periodEnd: "2028-10-01T00:00:00.000Z",
    })).toThrow("period or unit grants");
  });

  it("canonicalizes bucket order before persistence idempotency", () => {
    const parsed = parseOperatorAllowanceCommand({
      ...award,
      grants: [
        { unitKind: "completed_tracker_change", units: 2 },
        { unitKind: "completed_document_change", units: 1 },
      ],
    });
    expect(parsed.action === "award_period" && parsed.grants.map((grant) => grant.unitKind)).toEqual([
      "completed_document_change",
      "completed_tracker_change",
    ]);
  });
});
