import { describe, expect, it } from "vitest";
import { ONBOARDING_RECENT_HISTORY } from "@/products/onboarding/contracts";
import { assignCase, createOnboardingCase } from "@/products/onboarding/engine";

const OWNER = "d2000000-0000-4000-8000-000000000001";

describe("onboarding case history", () => {
  it("takes 600 changes and keeps the latest entries in the payload", () => {
    // Before the fix the payload kept every entry, capped at 500, so the
    // 500th change failed schema validation and the case was stuck.
    let current = createOnboardingCase({
      title: "Supplier onboarding",
      subjectType: "supplier",
      subjectLabel: "Acme Supplies",
      requirements: [{ key: "tax_id", label: "Tax ID", fields: [] }],
      actorId: OWNER,
    });
    for (let i = 1; i <= 600; i += 1) current = assignCase(current, OWNER, { email: `reviewer${i}@example.com` });
    expect(current.revision).toBe(601);
    expect(current.assignee).toEqual({ email: "reviewer600@example.com" });
    expect(current.history).toHaveLength(ONBOARDING_RECENT_HISTORY);
    expect(current.history.at(-1)).toMatchObject({ revision: 601, kind: "assigned" });
    expect(current.history[0]!.revision).toBe(601 - ONBOARDING_RECENT_HISTORY + 1);
  });
});
