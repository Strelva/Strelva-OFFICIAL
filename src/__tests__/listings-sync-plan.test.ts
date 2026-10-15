import { describe, expect, it } from "vitest";
import { listingsHeadline, type SurfaceReading } from "@/products/listings-sync/contracts";
import { planFixes, planHash, planLines, type PlanContext } from "@/products/listings-sync/plan";

const reading = (surfaceKey: string, kind: SurfaceReading["kind"], facts: SurfaceReading["facts"], extra: Partial<SurfaceReading> = {}): SurfaceReading => ({
  surfaceKey, kind, label: surfaceKey, url: null, changeBy: "strelva", state: "read", facts, ...extra,
});
const differs = (fact: SurfaceReading["facts"][number]["fact"], shown = "old", expected = "new") => ({ fact, state: "differs" as const, shown, expected });

const ctx: PlanContext = {
  googleFix: false, hasAgency: false,
  recordHours: [{ day: 1, opens: "09:00", closes: "17:00" }],
  booking: { "booking:main": { scope: "t1", weekly: [{ day: 1, opens: "08:00", closes: "20:00" }, { day: 2, opens: "09:00", closes: "10:00" }] } },
  google: { "google:loc1": { tenantId: "t1", locationId: "loc1" } },
  websites: { "website:tenant:t1": { kind: "tenant", tenantId: "t1", siteUrl: "https://example.test/" } },
};

describe("planFixes", () => {
  it("clips booking hours to the record's ranges", () => {
    const fixes = planFixes([reading("booking:main", "booking", [differs("hours")])], ctx);
    expect(fixes).toEqual([{ surfaceKey: "booking:main", factKey: "hours", kind: "booking_hours", proposed: { scope: "t1", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }] } }]);
  });
  it("makes Google differences owner to-dos until the fix Release is reached", () => {
    const readings = [reading("google:loc1", "google", [differs("hours"), differs("phone")])];
    expect(planFixes(readings, ctx).map(fix => fix.kind)).toEqual(["owner_todo", "owner_todo"]);
    expect(planFixes(readings, { ...ctx, googleFix: true }).map(fix => fix.kind)).toEqual(["google_hours", "google_info"]);
  });
  it("never writes a Google address", () => {
    const fixes = planFixes([reading("google:loc1", "google", [differs("address")])], { ...ctx, googleFix: true });
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ kind: "owner_todo", factKey: "address" });
  });
  it("files one Request per website with every line when an agency exists", () => {
    const readings = [reading("website:tenant:t1", "website", [differs("phone", "111", "222"), differs("hours", "a", "b")])];
    const fixes = planFixes(readings, { ...ctx, hasAgency: true });
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ kind: "site_request", factKey: "page" });
    expect((fixes[0]!.proposed.lines as string[])).toHaveLength(2);
    expect(planFixes(readings, ctx)[0]!.kind).toBe("owner_todo");
  });
  it("only plans from differs and gives Yelp an owner to-do", () => {
    expect(planFixes([reading("website:tenant:t1", "website", [{ fact: "phone", state: "not_shown", shown: null, expected: "x" }])], ctx)).toEqual([]);
    const yelp = planFixes([reading("yelp:t1", "yelp", [differs("phone")], { changeBy: "read_only" })], ctx);
    expect(yelp[0]).toMatchObject({ kind: "owner_todo", factKey: "page" });
  });
});

describe("planHash and planLines", () => {
  const a = { surfaceKey: "a:1", factKey: "hours" as const, kind: "booking_hours" as const, proposed: { scope: "t" } };
  const b = { surfaceKey: "b:1", factKey: "page" as const, kind: "site_request" as const, proposed: { lines: ["x"] } };
  const todo = { surfaceKey: "c:1", factKey: "address" as const, kind: "owner_todo" as const, proposed: { lines: ["y"] } };
  it("is stable under reordering and ignores owner to-dos", () => {
    expect(planHash(3, [a, b])).toBe(planHash(3, [b, a, todo]));
    expect(planHash(3, [a, b])).not.toBe(planHash(4, [a, b]));
  });
  it("writes owner-readable lines", () => {
    const readings = [
      reading("booking:main", "booking", [differs("hours", "Monday 18:00–20:00", "Inside your hours")]),
      reading("website:tenant:t1", "website", [differs("phone", "1", "(716) 555-0100")]),
    ];
    const lines = planLines([
      { surfaceKey: "booking:main", factKey: "hours", kind: "booking_hours", proposed: {} },
      { surfaceKey: "website:tenant:t1", factKey: "page", kind: "site_request", proposed: { siteUrl: "https://www.example.test/" } },
    ], readings);
    expect(lines).toEqual([
      "Booking page: booking times outside your hours are removed (Monday 18:00–20:00).",
      "example.test: your agency is asked to change phone to (716) 555-0100.",
    ]);
  });
});

describe("listingsHeadline", () => {
  const fact = (state: SurfaceReading["facts"][number]["state"]) => ({ fact: "phone" as const, state, shown: null, expected: null });
  it("covers each tone", () => {
    expect(listingsHeadline({ surfaces: [], checkedAt: null })).toEqual({ tone: "unchecked", text: "Not checked yet" });
    expect(listingsHeadline({ surfaces: [reading("a:1", "website", [fact("differs")])], checkedAt: "x" })).toEqual({ tone: "differs", text: "1 place differs" });
    expect(listingsHeadline({ surfaces: [reading("a:1", "website", [fact("differs")]), reading("b:1", "google", [fact("differs")])], checkedAt: "x" }).text).toBe("2 places differ");
    expect(listingsHeadline({ surfaces: [reading("a:1", "google", [], { state: "waiting_on_google" })], checkedAt: "x" })).toEqual({ tone: "waiting", text: "Waiting on Google" });
    expect(listingsHeadline({ surfaces: [reading("a:1", "website", [fact("matches")])], checkedAt: "x" })).toEqual({ tone: "matches", text: "Everything matches" });
    expect(listingsHeadline({ surfaces: [reading("a:1", "website", [fact("not_shown")])], checkedAt: "x" })).toEqual({ tone: "unchecked", text: "Nothing to compare yet" });
  });
});
