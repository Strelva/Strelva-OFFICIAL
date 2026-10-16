import { describe, expect, it } from "vitest";
import { publicAppOrigin } from "@/platform/infra/brand";
import { foundPhrase, ownerClaimUrl } from "@/experience/workspace/agency/AgencyAddClient";
import { greetingFor } from "@/experience/workspace/agency/AgencyDayOne";
import { lastChangeLabel, ownerWaitsSentence, waitsOnYouSentence } from "@/experience/workspace/agency/AgencyEveryClient";
import type { AgencyClientRow } from "@/experience/workspace/agency-clients";

// XA-2 words and links: the claim link is built on the public origin, and A6 names the client that waits.

describe("owner claim link origin", () => {
  it("uses NEXT_PUBLIC_APP_URL's origin when valid and the control plane otherwise", () => {
    expect(publicAppOrigin("https://app.example.test/some/path")).toBe("https://app.example.test");
    expect(publicAppOrigin("not a url")).toMatch(/^https:\/\/app\./);
    expect(publicAppOrigin("")).toMatch(/^https:\/\/app\./);
  });
  it("never takes the origin of the page the agency is on", () => {
    expect(ownerClaimUrl("/workspace/claim/abc", "https://app.strelva.com")).toBe("https://app.strelva.com/workspace/claim/abc");
    expect(ownerClaimUrl("/workspace/claim/abc")).not.toContain("localhost:3201");
  });
});

describe("A3 and A5 words", () => {
  it("greets by the time of day", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(20)).toBe("Good evening");
  });
  it("says what the read found in one phrase", () => {
    expect(foundPhrase(["phone", "email", "address"])).toBe("a phone, an email and an address");
    expect(foundPhrase(["phone"])).toBe("a phone");
  });
});

describe("A6 words", () => {
  const base = { workspaceId: "w", name: "Lakeview Mediation", reach: "agency", role: "agency", provider: true, status: "ready", systems: [], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null } as unknown as AgencyClientRow;
  it("names the client and what waits on the agency", () => {
    expect(waitsOnYouSentence({ ...base, openRequests: 1 })).toBe("Lakeview Mediation has 1 open request.");
    expect(waitsOnYouSentence({ ...base, systems: [{ id: "s", name: "Showings", kind: "bookings", lifecycle: "live", versionContext: null, health: { status: "blocked", summary: "", lastVerifiedAt: null } }] } as unknown as AgencyClientRow))
      .toBe("Showings at Lakeview Mediation is not working.");
  });
  it("labels the last change in plain days, not receipts", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(lastChangeLabel(null, now)).toBe("None yet");
    expect(lastChangeLabel("2026-10-16T09:00:00Z", now)).toBe("Today");
    expect(lastChangeLabel("2026-10-12T09:00:00Z", now)).toMatch(/days ago$/);
  });
});

describe("A6 owner line", () => {
  const client = (name: string, over: Partial<AgencyClientRow> = {}) => ({ workspaceId: name, name, reach: "agency", role: "agency", provider: true, status: "ready", systems: [], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null, ...over }) as unknown as AgencyClientRow;
  it("counts every owner wait, not just the first", () => {
    expect(ownerWaitsSentence([client("Harbor Dental", { needsYou: { count: 1, oldestAt: "2026-11-22T00:00:00Z" } }), client("Fieldwork Studio", { needsYou: { count: 1, oldestAt: "2026-11-22T12:00:00Z" } }), client("North Coast Realty")]))
      .toBe("Harbor Dental and Fieldwork Studio each wait on an owner for one decision.");
    expect(ownerWaitsSentence([client("Harbor Dental", { needsYou: { count: 1, oldestAt: "2026-11-22T00:00:00Z" } })])).toBe("Harbor Dental waits on its owner for one decision.");
    expect(ownerWaitsSentence([client("A", { ownerClaimWaiting: true }), client("B", { needsYou: { count: 2, oldestAt: "2026-11-20T00:00:00Z" } }), client("C", { needsYou: { count: 1, oldestAt: "2026-11-21T00:00:00Z" } })]))
      .toBe("A waits for its owner to claim it. Two more wait on their owners.");
    expect(ownerWaitsSentence([client("A")])).toBeNull();
  });
});
