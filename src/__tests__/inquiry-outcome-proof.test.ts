import { afterEach, describe, expect, it, vi } from "vitest";
import { readTenantInquiryOutcomeProof } from "@/products/inquiries/outcome-proof";
import { inquiryProofHighlights } from "@/lib/weekly-brief";

const cohort = { inquiries: 3, answered: 2, withinDay: 1, unanswered: 1, averageReplySeconds: 90000, medianReplySeconds: 90000 };
afterEach(() => vi.unstubAllEnvs());
describe("weekly inquiry proof", () => {
  it("flags off makes no database read and adds no report highlights", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES", "");
    const rpc = vi.fn();
    expect(await readTenantInquiryOutcomeProof("fixture", "2026-10-01", "2026-10-08", rpc)).toEqual({ status: "unavailable", reason: "inquiry_outcomes_off" });
    expect(rpc).not.toHaveBeenCalled();
    expect(inquiryProofHighlights(undefined)).toEqual([]);
  });
  it("uses the trusted tenant cohort and states acceptance rather than delivery", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES", "1");
    const rpc = vi.fn(async () => cohort);
    const proof = await readTenantInquiryOutcomeProof("fixture", "2026-10-01", "2026-10-08", rpc);
    expect(proof).toMatchObject({ status: "available", ...cohort });
    expect(rpc).toHaveBeenCalledWith("business_inquiry_outcomes_for_tenant", { p_tenant_id: "fixture", p_from: "2026-10-01", p_to: "2026-10-08" });
    expect(inquiryProofHighlights(proof)).toEqual([
      "3 inquiries received this week; 2 answered, 1 within a day. Replies count when the email provider accepts them.",
      "First reply time: 25.0 hours average; 25.0 hours median.",
    ]);
  });
  it("a complete empty cohort has no reply time; missing storage never earns zero", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES", "1");
    const empty = await readTenantInquiryOutcomeProof("fixture", "2026-10-01", "2026-10-08", vi.fn(async () => ({ inquiries: 0, answered: 0, withinDay: 0, unanswered: 0, averageReplySeconds: null, medianReplySeconds: null })));
    expect(empty).toMatchObject({ status: "available", inquiries: 0 });
    expect(inquiryProofHighlights(empty)[1]).toContain("unavailable");
    const unavailable = await readTenantInquiryOutcomeProof("fixture", "2026-10-01", "2026-10-08", vi.fn(async () => { throw new Error("DB unavailable"); }));
    expect(inquiryProofHighlights(unavailable)).toEqual(["Inquiry counts and reply times are unavailable. This report does not estimate them."]);
  });
  it("rejects invalid periods and malformed, inconsistent or invented proof", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES", "1");
    const rpc = vi.fn();
    expect(await readTenantInquiryOutcomeProof("fixture", "2026-10-08", "2026-10-01", rpc)).toMatchObject({ status: "unavailable" });
    expect(rpc).not.toHaveBeenCalled();
    for (const bad of [null, {}, { ...cohort, answered: 4 }, { ...cohort, withinDay: 3 }, { ...cohort, unanswered: 0 }, { ...cohort, averageReplySeconds: -1 }, { ...cohort, medianReplySeconds: null }]) {
      expect(await readTenantInquiryOutcomeProof("fixture", "2026-10-01", "2026-10-08", vi.fn(async () => bad))).toMatchObject({ status: "unavailable" });
    }
  });
});
