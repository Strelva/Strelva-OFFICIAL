import { afterEach, describe, expect, it, vi } from "vitest";
import { inquiryPersonEmail, inquiryWithinBusinessHours, readInquiryBusinessContext, type InquiryBusinessContext } from "@/products/inquiries/business-context";

const personId = "c0000000-0000-4000-8000-000000000001";
const context: InquiryBusinessContext = { workspaceId: "c0000000-0000-4000-8000-000000000002", services: [],
  people: [{ id: personId, name: "Maria", email: "maria@example.test", active: true }],
  facts: { hours: { verified: true, value: { timezone: "America/New_York", weekly: [{ day: 6, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-10-17", closed: true }] } } } };
afterEach(() => vi.unstubAllEnvs());
describe("inquiry facts at use", () => {
  it("off never reads the business record", async () => {
    vi.stubEnv("STRELVA_INQUIRY_BUSINESS_FACTS", ""); const read = vi.fn();
    expect(await readInquiryBusinessContext("site", read)).toBeNull(); expect(read).not.toHaveBeenCalled();
  });
  it("reads the trusted tenant and rejects malformed storage", async () => {
    vi.stubEnv("STRELVA_INQUIRY_BUSINESS_FACTS", "1"); const read = vi.fn().mockResolvedValue(context);
    expect(await readInquiryBusinessContext("site", read)).toEqual(context);
    expect(read).toHaveBeenCalledWith("read_inquiry_business_context", { p_tenant_id: "site" });
    read.mockResolvedValue({ workspaceId: "other" }); await expect(readInquiryBusinessContext("site", read)).rejects.toThrow();
  });
  it("resolves people by stable id and sends removed people to owner fallback", () => {
    expect(inquiryPersonEmail(context, `person:${personId}`)).toBe("maria@example.test");
    expect(inquiryPersonEmail({ ...context, people: [{ ...context.people[0]!, active: false }] }, personId)).toBeNull();
    expect(inquiryPersonEmail(context, "other@example.test")).toBeNull();
  });
  it("uses local hours, dated closures and verified facts", () => {
    expect(inquiryWithinBusinessHours(context, new Date("2026-10-10T13:00:00Z"))).toBe(true);
    expect(inquiryWithinBusinessHours(context, new Date("2026-10-10T21:00:00Z"))).toBe(false);
    expect(inquiryWithinBusinessHours(context, new Date("2026-10-17T13:00:00Z"))).toBe(false);
    expect(inquiryWithinBusinessHours({ ...context, facts: {} }, new Date("2026-10-10T13:00:00Z"))).toBe(false);
  });
});
