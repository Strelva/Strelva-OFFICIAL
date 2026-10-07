import { afterEach, describe, expect, it, vi } from "vitest";
import { formatOutcomeLine, readBusinessInquiryOutcomes, type BusinessOutcomeMonth } from "@/platform/business-outcomes";

const workspaceId = "a6200000-0000-4000-8000-000000000001";
const actor = { userId: "a6200000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const cohort = { workspaceId, from: "2026-10-01T00:00:00Z", to: "2026-10-08T00:00:00Z", inquiries: 3, answered: 2,
  withinDay: 1, unanswered: 1, averageReplySeconds: 90000, medianReplySeconds: 90000 };
afterEach(() => vi.unstubAllEnvs());

describe("owner inquiry outcome reporting", () => {
  it("keeps complete cohort scope and distinguishes acceptance from delivery", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES", "1");
    const rpc = vi.fn(async () => ({ data: cohort, error: null }));
    expect(await readBusinessInquiryOutcomes(actor, workspaceId, cohort.from, cohort.to, rpc))
      .toEqual({ ...cohort, evidence: "First provider acceptance; delivery and customer response are separate evidence." });
    expect(rpc).toHaveBeenCalledWith("business_inquiry_outcomes", expect.objectContaining({ p_user_id: actor.userId, p_workspace_id: workspaceId }));
  });
  it("refuses malformed, cross-business, wrong-period and impossible counts", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES", "1");
    for (const data of [null, {}, { ...cohort, workspaceId: actor.userId }, { ...cohort, from: cohort.to },
      { ...cohort, answered: 4 }, { ...cohort, withinDay: 3 }, { ...cohort, unanswered: 0 },
      { ...cohort, averageReplySeconds: null }, { ...cohort, medianReplySeconds: -1 }]) {
      await expect(readBusinessInquiryOutcomes(actor, workspaceId, cohort.from, cohort.to, async () => ({ data, error: null })))
        .rejects.toMatchObject({ code: "unavailable" });
    }
  });
  it("flag off and unbounded periods never query evidence", async () => {
    const rpc = vi.fn();
    await expect(readBusinessInquiryOutcomes(actor, workspaceId, cohort.from, cohort.to, rpc)).rejects.toMatchObject({ code: "unavailable" });
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES", "1");
    await expect(readBusinessInquiryOutcomes(actor, workspaceId, "2025-01-01", "2026-10-01", rpc)).rejects.toMatchObject({ code: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("monthly proof includes the total answered count and first reply times", () => {
    const month: BusinessOutcomeMonth = { workspaceId, month: "2026-10", sites: 1, visits: { kind: "counted", value: null },
      inquiries: { kind: "counted", value: 3 }, answered: { kind: "linked", value: 2, withinDay: 1, averageReplySeconds: 90000, medianReplySeconds: 90000 },
      bookings: { kind: "counted", value: 0, native: 0, legacy: 0 }, bookingsFromInquiry: { kind: "linked", value: null, joins: [] }, reviews: { kind: "counted", value: null } };
    expect(formatOutcomeLine(month).text).toBe("3 inquiries; 2 answered, 1 within a day. First reply: 25.0 hours average; 25.0 hours median. Replies count when the email provider accepts them. 0 bookings.");
    const legacy = { ...month, answered: { kind: "linked" as const, value: 2, withinDay: 1 } };
    expect(formatOutcomeLine(legacy).text).toBe("3 inquiries; 1 answered within a day. 0 bookings.");
  });
});
