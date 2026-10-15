import { describe, expect, it } from "vitest";
import { intakeCanGoLive, intakeReadiness } from "@/products/vertical-intake/readiness";

const full = { facts: { phone: "716-555-0100", hours: { timezone: "UTC", weekly: [] }, insurance_accepted: { carriers: ["Cigna"] } }, verifiedSites: 1, bookingServiceName: "New patient exam", manualBookingsOn: true, emailOn: false };
const row = (input: Parameters<typeof intakeReadiness>[0], id: string) => intakeReadiness(input).find(item => item.id === id)!;

describe("intakeReadiness", () => {
  it("is ready when the phone and a verified site exist, and nothing else is required", () => {
    expect(intakeCanGoLive(intakeReadiness(full))).toBe(true);
    expect(intakeCanGoLive(intakeReadiness({ ...full, facts: { phone: "716-555-0100" }, bookingServiceName: null, manualBookingsOn: false }))).toBe(true);
  });

  it("blocks only on the phone fact and a verified site", () => {
    const noPhone = intakeReadiness({ ...full, facts: {} });
    expect(intakeCanGoLive(noPhone)).toBe(false);
    expect(row({ ...full, facts: {} }, "phone")).toMatchObject({ state: "missing", blocking: true, label: "Office phone in Business details" });
    expect(intakeCanGoLive(intakeReadiness({ ...full, verifiedSites: 0 }))).toBe(false);
    expect(row({ ...full, verifiedSites: 0 }, "site")).toMatchObject({ state: "missing", blocking: true, label: "Your website is connected" });
    expect(intakeReadiness(full).filter(item => item.blocking).map(item => item.id)).toEqual(["phone", "site"]);
  });

  it("says plainly what a missing optional step costs", () => {
    const bare = { ...full, facts: { phone: "716-555-0100" }, bookingServiceName: null };
    expect(row(bare, "insurance")).toMatchObject({ state: "missing", blocking: false, label: "Insurance plans you accept", detail: "Patients will only see No insurance and Other." });
    expect(row(bare, "hours")).toMatchObject({ state: "missing", blocking: false, label: "Office hours", detail: "The pain message can't say whether you're open now." });
    expect(row(bare, "booking")).toMatchObject({ state: "missing", blocking: false, label: "Visit times from Bookings", detail: "Without it, Strelva won't propose times and the office books by phone." });
  });

  it("treats manual bookings being off like no booking service", () => {
    expect(row({ ...full, manualBookingsOn: false }, "booking").state).toBe("missing");
    expect(row(full, "booking").state).toBe("done");
  });

  it("notes that patients are not emailed while customer email is off", () => {
    expect(row(full, "email")).toMatchObject({ state: "note", blocking: false });
    expect(row(full, "email").detail).toBe("Patients aren't emailed while customer email is off. The office calls them back.");
    expect(row({ ...full, emailOn: true }, "email").detail).not.toContain("aren't emailed");
  });
});
