import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_REACH_STATES, lapseLabel, ownerReach, ownerReachReleaseEnabled } from "@/platform/owner-reach";

const now = Date.parse("2026-10-20T12:00:00Z");
const base = { ownerMember: false, contact: "none" as const, contactProposed: false, invite: null, clientEmailOn: false, now };
const invite = (over: Partial<NonNullable<Parameters<typeof ownerReach>[0]["invite"]>> = {}) => ({
  kind: "agency_claim", expiresAt: "2026-10-30T12:00:00Z", deliveryStatus: "not_sent", recipientStaff: false, ...over,
});

describe("ownerReach", () => {
  it("lists every state", () => {
    expect(OWNER_REACH_STATES).toEqual(["owner_in", "claim_waiting", "claim_to_staff", "staff_address", "no_contact", "email_off", "reachable"]);
  });

  it("an owner who is signed in wins over a staff contact and a staff link", () => {
    expect(ownerReach({ ...base, ownerMember: true, contact: "trusted_staff", invite: invite({ recipientStaff: true }) }))
      .toEqual({ state: "owner_in", reachable: true, reason: "Owner signed in" });
  });

  it("a link addressed to staff wins over a trusted address", () => {
    expect(ownerReach({ ...base, contact: "trusted", clientEmailOn: true, invite: invite({ recipientStaff: true }) }))
      .toEqual({ state: "claim_to_staff", reachable: false, reason: "The owner link is addressed to staff, not the owner" });
  });

  it("a claim the provider accepted is reachable until it expires", () => {
    expect(ownerReach({ ...base, invite: invite({ deliveryStatus: "accepted" }) }))
      .toEqual({ state: "claim_waiting", reachable: true, reason: "Claim emailed · works until Oct 30" });
  });

  it("a claim not sent says so, and says why when email to owners is off", () => {
    expect(ownerReach({ ...base, invite: invite() }))
      .toEqual({ state: "claim_waiting", reachable: false, reason: "Claim not sent: email to owners is off. Share the link yourself · works until Oct 30" });
    expect(ownerReach({ ...base, clientEmailOn: true, invite: invite() }))
      .toEqual({ state: "claim_waiting", reachable: false, reason: "Claim not sent. Share the link yourself · works until Oct 30" });
  });

  it("an expired link is ignored", () => {
    expect(ownerReach({ ...base, invite: invite({ expiresAt: "2026-10-19T12:00:00Z" }) }).state).toBe("no_contact");
  });

  it("a staff contact is not an owner", () => {
    expect(ownerReach({ ...base, contact: "trusted_staff", clientEmailOn: true }))
      .toEqual({ state: "staff_address", reachable: false, reason: "Owner email on record is a staff address" });
  });

  it("no contact, with and without a proposed address", () => {
    expect(ownerReach(base)).toEqual({ state: "no_contact", reachable: false, reason: "No owner email on record" });
    expect(ownerReach({ ...base, contactProposed: true }))
      .toEqual({ state: "no_contact", reachable: false, reason: "No owner email on record · an address was added and waits for the owner to confirm it" });
  });

  it("a trusted address is only reachable while email to owners is on", () => {
    expect(ownerReach({ ...base, contact: "trusted" }))
      .toEqual({ state: "email_off", reachable: false, reason: "Owner email on record, but email to owners is off" });
    expect(ownerReach({ ...base, contact: "trusted", clientEmailOn: true }))
      .toEqual({ state: "reachable", reachable: true, reason: "Owner reachable by email" });
  });
});

describe("lapseLabel", () => {
  const at = (days: number) => new Date(now + days * 86_400_000).toISOString();
  it("counts whole days up", () => {
    expect(lapseLabel(at(0), now)).toBe("Lapses today");
    expect(lapseLabel(at(-2), now)).toBe("Lapses today");
    expect(lapseLabel(at(1), now)).toBe("Lapses tomorrow");
    expect(lapseLabel(at(2.5), now)).toBe("Lapses in 3 days");
    expect(lapseLabel(at(5), now)).toBe("Lapses in 5 days");
  });
  it("is null for an unreadable date", () => {
    expect(lapseLabel("not a date", now)).toBeNull();
  });
});

describe("ownerReachReleaseEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is off by default and needs the workspace release", () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "");
    vi.stubEnv("STRELVA_OWNER_REACH_RELEASE", "");
    expect(ownerReachReleaseEnabled()).toBe(false);
    vi.stubEnv("STRELVA_OWNER_REACH_RELEASE", "1");
    expect(ownerReachReleaseEnabled()).toBe(false);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect(ownerReachReleaseEnabled()).toBe(true);
  });
});
