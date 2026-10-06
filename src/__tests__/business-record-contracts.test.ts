import { describe, expect, it } from "vitest";
import {
  businessRecordPatchSchema,
  contactInputSchema,
  factValueSchemas,
  parseFactValue,
  patchVerificationAllowed,
  phoneKey,
} from "@/platform/business-record/contracts";

describe("business record contracts", () => {
  it("normalizes phones the same way as the database key", () => {
    expect(phoneKey("(716) 555-0122")).toBe("17165550122");
    expect(phoneKey("+1 716-555-0122")).toBe("17165550122");
    expect(phoneKey("555-01")).toBeNull();
    expect(phoneKey("1234567890123456")).toBeNull();
  });

  it("accepts weekly hours with date overrides and rejects inverted or impossible ones", () => {
    const hours = {
      timezone: "America/New_York",
      weekly: [{ day: 1, opens: "09:00", closes: "17:00" }, { day: 6, opens: "10:00", closes: "24:00" }],
      overrides: [{ date: "2026-12-25", closed: true, label: "Christmas" }, { date: "2026-12-24", closed: false, opens: "09:00", closes: "12:00" }],
    };
    expect(parseFactValue("hours", hours)).toEqual(hours);
    expect(factValueSchemas.hours.safeParse({ ...hours, weekly: [{ day: 1, opens: "17:00", closes: "09:00" }] }).success).toBe(false);
    expect(factValueSchemas.hours.safeParse({ ...hours, weekly: [{ day: 7, opens: "09:00", closes: "17:00" }] }).success).toBe(false);
    expect(factValueSchemas.hours.safeParse({ ...hours, overrides: [{ date: "2026-02-30", closed: true }] }).success).toBe(false);
    expect(factValueSchemas.hours.safeParse({ ...hours, overrides: [{ date: "2026-12-25", closed: true, opens: "09:00" }] }).success).toBe(false);
  });

  it("requires lowercase owner recipient email and a usable address", () => {
    expect(factValueSchemas.owner_recipient.safeParse({ email: "owner@example.com", name: "Pat" }).success).toBe(true);
    expect(factValueSchemas.owner_recipient.safeParse({ email: "Owner@Example.com" }).success).toBe(false);
    expect(factValueSchemas.address.safeParse({ city: "Buffalo" }).success).toBe(false);
    expect(factValueSchemas.address.safeParse({ formatted: "1 Main St, Buffalo, NY" }).success).toBe(true);
    expect(factValueSchemas.links.safeParse([{ kind: "website", url: "javascript:alert(1)" }]).success).toBe(false);
  });

  it("rejects unknown facts, untrimmed names and empty patches", () => {
    expect(businessRecordPatchSchema.safeParse({}).success).toBe(false);
    expect(businessRecordPatchSchema.safeParse({ facts: { favorite_color: { value: "blue" } } }).success).toBe(false);
    expect(businessRecordPatchSchema.safeParse({ facts: { display_name: { value: " Juniper " } } }).success).toBe(false);
    expect(businessRecordPatchSchema.safeParse({ facts: { phone: null } }).success).toBe(true);
    expect(businessRecordPatchSchema.safeParse({ services: [{ op: "remove" }] }).success).toBe(false);
  });

  it("lets only owners and operators mark something verified", () => {
    const patch = businessRecordPatchSchema.parse({ facts: { phone: { value: "716-555-0100", verified: true } } });
    expect(patchVerificationAllowed(patch, "owner")).toBe(true);
    expect(patchVerificationAllowed(patch, "operator")).toBe(true);
    expect(patchVerificationAllowed(patch, "bookings")).toBe(false);
    expect(patchVerificationAllowed(patch, "agency")).toBe(false);
  });

  it("needs an email or phone for every contact and lowercases email", () => {
    expect(contactInputSchema.safeParse({ name: "Nobody", source: "inquiry" }).success).toBe(false);
    expect(contactInputSchema.parse({ email: " Casey@Example.NET ", source: "booking" }).email).toBe("casey@example.net");
    expect(contactInputSchema.safeParse({ phone: "12", source: "inquiry" }).success).toBe(false);
  });
});
