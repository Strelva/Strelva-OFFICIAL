import { describe, expect, it } from "vitest";
import {
  assertBuiltInAppCatalog,
  BUILT_IN_APP_IDS,
  BUILT_IN_APPS,
  builtInApp,
  builtInAppForMakeRealChannel,
  builtInAppForSystemKind,
  builtInAppReleaseLabel,
  flagReleaseMeaning,
  releaseLabel,
  releasesGatedByFlag,
  rollbackPlan,
  type BuiltInApp,
  type BuiltInAppRelease,
} from "@/platform/app-releases";
import { RELEASE_FLAGS } from "@/platform/release-flags/resolve";

// Subset of scripts/check-words.mjs `retired`.
const RETIRED = ["Ready-made", "Private app", "Make it real", "Approve and publish", "Source revisions"];

const release = (appId: string, number: number, patch: Partial<BuiltInAppRelease> = {}): BuiltInAppRelease => ({
  key: `${appId}.r${number}`, number, summary: "A thing.", shippedIn: null, changesLiveBehavior: false, gates: [], requiredConnections: [], ...patch,
});
const app = (id: string, releases: BuiltInAppRelease[], patch: Partial<BuiltInApp> = {}): BuiltInApp => ({
  id: id as BuiltInApp["id"], name: "Bookings", publisher: "platform", systemKinds: [], labelOnSystems: true, makeRealChannels: [], availability: [], releases, ...patch,
});

describe("built-in App catalog", () => {
  it("lists the declared ids in order and passes its own invariants", () => {
    expect(BUILT_IN_APPS.map(item => item.id)).toEqual([...BUILT_IN_APP_IDS]);
    expect(() => assertBuiltInAppCatalog()).not.toThrow();
  });

  it("makes Release 1 the ungated 1.0.0 baseline for every App", () => {
    const ADDED_AFTER_1_0 = new Set(["care_reports"]);
    for (const item of BUILT_IN_APPS) {
      expect(item.releases[0]!.gates, item.id).toEqual([]);
      expect(item.releases[0]!.shippedIn, item.id).toBe(ADDED_AFTER_1_0.has(item.id) ? null : "1.0.0");
      if (ADDED_AFTER_1_0.has(item.id)) expect(item.availability.some(g => g.kind === "workspace_flag"), item.id).toBe(true);
    }
  });

  it("labels Releases with GLOSSARY words", () => {
    expect(builtInAppReleaseLabel(builtInApp("bookings"), 2)).toBe("Bookings Release 2");
    expect(releaseLabel(12)).toBe("Release 12");
    for (const item of BUILT_IN_APPS) for (const r of item.releases) for (const word of RETIRED) expect(r.summary).not.toContain(word);
  });

  it("maps Make it live channels and System kinds to Apps", () => {
    expect(builtInAppForMakeRealChannel("inquiry_form")?.id).toBe("inquiries");
    expect(builtInAppForMakeRealChannel("booking_page")?.id).toBe("bookings");
    expect(builtInAppForMakeRealChannel("internal_app")?.id).toBe("internal_tools");
    for (const channel of ["hosted_website", "tenant_content", "google_listing"] as const) expect(builtInAppForMakeRealChannel(channel)).toBeNull();
    expect(builtInAppForSystemKind("booking")?.id).toBe("bookings");
    expect(builtInAppForSystemKind("website")).toBeNull();
    expect(builtInAppForSystemKind("report")?.id).toBe("recaps");
  });

  it("plans rollback from a Release's own gates", () => {
    const base = release("x", 1);
    const redeploy = app("bookings", [base, release("bookings", 2)]);
    const business = app("bookings", [base, release("bookings", 2, { gates: [{ kind: "workspace_flag", flag: "catalog_reports" }] })]);
    const everywhere = app("bookings", [base, release("bookings", 2, { gates: [{ kind: "workspace_flag", flag: "catalog_reports" }, { kind: "env", name: "STRELVA_X", values: ["1"] }] })]);
    expect(rollbackPlan(redeploy, 2)).toMatchObject({ from: 2, to: 1, scope: "redeploy", turnOff: [] });
    expect(rollbackPlan(business, 2).scope).toBe("business");
    expect(rollbackPlan(everywhere, 2).scope).toBe("everywhere");
    expect(() => rollbackPlan(business, 1)).toThrow("Release 1 is the baseline and has no rollback.");
  });

  it("treats availability as not a Release", () => {
    expect(releasesGatedByFlag("inquiries")).toEqual([]);
    expect(flagReleaseMeaning("care_reports")).toBeNull();
  });

  it("only uses known release flags in gates", () => {
    for (const item of BUILT_IN_APPS) for (const gate of [...item.availability, ...item.releases.flatMap(r => r.gates)]) {
      if (gate.kind === "workspace_flag") expect(RELEASE_FLAGS).toContain(gate.flag);
    }
  });

  it("rejects bad entries, naming the App and Release", () => {
    const r1 = release("bookings", 1);
    expect(() => assertBuiltInAppCatalog([app("bookings", [r1, release("bookings", 2, { changesLiveBehavior: true })])])).toThrow(/Bookings Release 2.*gate/);
    expect(() => assertBuiltInAppCatalog([app("bookings", [r1, release("bookings", 3)])])).toThrow(/Bookings Release 3.*number/);
    expect(() => assertBuiltInAppCatalog([app("bookings", [{ ...r1, key: "other.r1" }])])).toThrow(/key/);
    expect(() => assertBuiltInAppCatalog([app("bookings", [r1, release("bookings", 2, { gates: [{ kind: "env", name: "FOO", values: ["1"] }] })])])).toThrow(/invalid gate/);
    expect(() => assertBuiltInAppCatalog([
      app("bookings", [r1], { systemKinds: ["booking"] }),
      app("inquiries", [release("inquiries", 1)], { name: "Inquiries", systemKinds: ["booking"] }),
    ])).toThrow(/both claim/);
  });

  it("checks event subscriptions: scope, duplicates and handler keys", () => {
    const r1 = release("bookings", 1);
    const sub = { event: "booking.made", handler: "stop_follow_ups", scope: "bookings" } as const;
    const withSubs = (eventSubscriptions: BuiltInAppRelease["eventSubscriptions"]) => [app("bookings", [r1, release("bookings", 2, { eventSubscriptions })])];
    expect(() => assertBuiltInAppCatalog(withSubs([sub]))).not.toThrow();
    expect(() => assertBuiltInAppCatalog(withSubs([{ ...sub, scope: "inquiries" }]))).toThrow(/Bookings Release 2: booking\.made needs scope bookings\./);
    expect(() => assertBuiltInAppCatalog(withSubs([sub, sub]))).toThrow(/duplicate event subscription/);
    expect(() => assertBuiltInAppCatalog(withSubs([{ ...sub, handler: "Bad-Key" }]))).toThrow(/Bookings Release 2: invalid event subscription\./);
    expect(() => assertBuiltInAppCatalog(withSubs([{ ...sub, maxAttempts: 13 }]))).toThrow(/invalid event subscription/);
    // The same handler may take two different events.
    expect(() => assertBuiltInAppCatalog(withSubs([sub, { event: "booking.changed", handler: "stop_follow_ups", scope: "bookings" }]))).not.toThrow();
  });

  it("declares no subscription on the six 1.0 Apps", () => {
    for (const item of BUILT_IN_APPS) {
      if (!["bookings", "inquiries", "recaps", "documents", "ask", "internal_tools"].includes(item.id)) continue;
      expect(item.releases[0]!.eventSubscriptions ?? [], item.id).toEqual([]);
    }
  });
});
