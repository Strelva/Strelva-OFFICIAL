import { describe, expect, it } from "vitest";
import { comparePlatformSchema, platformSchemaFromHtml } from "@/products/connected-sites/schema-facts";
import { publicFactsFromRecord } from "@/products/connected-sites/contracts";
import { compareBooking, compareGoogle, compareWebsite, compareYelp, expectedFacts, type Expected, type WebsitePage } from "@/products/listings-sync/compare";

const TODAY = "2026-10-15";
const HOURS = { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }, { day: 2, opens: "09:00", closes: "17:00" }] };
const confirmed = (facts: Record<string, unknown>, services: string[] = []) => ({
  revision: 3, facts, services: services.map(name => ({ name, description: null, priceText: null })),
});
const base: Expected = expectedFacts(confirmed({
  phone: "(716) 555-0100",
  address: { line1: "12 Main St", city: "Buffalo", region: "NY", postalCode: "14201" },
  hours: HOURS,
  links: [{ kind: "booking", url: "https://book.example.test/square" }],
}, ["Cleaning", "Whitening"]), TODAY);

function page(html: string, siteUrl = "https://example.test/"): { page: WebsitePage; conflicts: ReturnType<typeof comparePlatformSchema> } {
  const report = platformSchemaFromHtml(html);
  const facts = publicFactsFromRecord({ facts: { phone: "(716) 555-0100", hours: HOURS }, services: [] });
  const telHrefs = [...html.matchAll(/href="(tel:[^"]+)"/g)].map(m => m[1]!);
  const hrefs = [...html.matchAll(/href="(https?:[^"]+)"/g)].map(m => m[1]!);
  return { page: { report, telHrefs, hrefs, text: html.replace(/<[^>]+>/g, " ") }, conflicts: comparePlatformSchema(report, facts, siteUrl) };
}
const ld = (body: Record<string, unknown>) => `<script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", url: "https://example.test/", ...body })}</script>`;
const fact = (list: ReturnType<typeof compareWebsite>, name: string) => list.find(item => item.fact === name);

describe("expectedFacts", () => {
  it("keeps only valid confirmed values and the next 60 days of overrides", () => {
    const e = expectedFacts(confirmed({
      phone: "x", hours: { ...HOURS, overrides: [{ date: "2026-10-20", closed: true }, { date: "2027-01-20", closed: true }, { date: "2026-10-01", closed: true }] },
    }), TODAY);
    expect(e.phone).toBeUndefined();
    expect(e.special.map(item => item.date)).toEqual(["2026-10-20"]);
  });
});

describe("compareWebsite", () => {
  it("flags a JSON-LD phone mismatch as differs", () => {
    const { page: p, conflicts } = page(`<html>${ld({ telephone: "(716) 555-9999" })}</html>`);
    expect(fact(compareWebsite(base, p, conflicts), "phone")).toMatchObject({ state: "differs", shown: "(716) 555-9999" });
  });
  it("matches a tel: link", () => {
    const { page: p, conflicts } = page(`<a href="tel:+17165550100">Call</a>`);
    expect(fact(compareWebsite(base, p, conflicts), "phone")?.state).toBe("matches");
  });
  it("reads no phone anywhere as not_shown, never differs", () => {
    const { page: p, conflicts } = page(`<p>Welcome</p>`);
    expect(fact(compareWebsite(base, p, conflicts), "phone")?.state).toBe("not_shown");
  });
  it("flags JSON-LD hours that disagree on Monday", () => {
    const { page: p, conflicts } = page(`<html>${ld({ openingHoursSpecification: [{ dayOfWeek: "Monday", opens: "10:00", closes: "18:00" }] })}</html>`);
    expect(fact(compareWebsite(base, p, conflicts), "hours")?.state).toBe("differs");
  });
  it("does not call hours without JSON-LD a difference", () => {
    const { page: p, conflicts } = page(`<p>Open weekdays</p>`);
    expect(fact(compareWebsite(base, p, conflicts), "hours")).toMatchObject({ state: "not_checked", note: "Hours on this page aren't machine-readable." });
  });
  it("flags a different scheduler link", () => {
    const { page: p, conflicts } = page(`<a href="https://calendly.com/someone/30min">Book</a>`);
    expect(fact(compareWebsite(base, p, conflicts), "booking_link")).toMatchObject({ state: "differs", shown: "https://calendly.com/someone/30min" });
  });
  it("matches the record's booking link and reports missing services without differs", () => {
    const { page: p, conflicts } = page(`<a href="https://book.example.test/square/">Book</a><p>Cleaning only</p>`);
    const list = compareWebsite(base, p, conflicts);
    expect(fact(list, "booking_link")?.state).toBe("matches");
    expect(fact(list, "services")).toMatchObject({ state: "not_shown", note: "Not on the page: Whitening" });
  });
  it("omits facts with no expected value", () => {
    const { page: p, conflicts } = page(`<p>x</p>`);
    expect(compareWebsite(expectedFacts(confirmed({}), TODAY), p, conflicts)).toEqual([]);
  });
});

describe("compareGoogle", () => {
  const regular = { regularHours: { periods: [
    { openDay: "MONDAY" as const, openTime: { hours: 9 }, closeDay: "MONDAY" as const, closeTime: { hours: 17 } },
    { openDay: "TUESDAY" as const, openTime: { hours: 9, minutes: 0 }, closeDay: "TUESDAY" as const, closeTime: { hours: 17 } },
  ] } };
  it("matches hours when Google omits zero minutes", () => {
    expect(compareGoogle(base, regular, TODAY).find(item => item.fact === "hours")?.state).toBe("matches");
  });
  it("flags a missing special day inside 60 days but ignores one 90 days out", () => {
    const withSpecial = expectedFacts(confirmed({ hours: { ...HOURS, overrides: [{ date: "2026-11-26", closed: true }, { date: "2027-01-20", closed: true }] } }), TODAY);
    expect(compareGoogle(withSpecial, regular, TODAY).find(item => item.fact === "special_hours")?.state).toBe("differs");
    const far = expectedFacts(confirmed({ hours: { ...HOURS, overrides: [{ date: "2027-01-20", closed: true }] } }), TODAY);
    expect(compareGoogle(far, regular, TODAY).find(item => item.fact === "special_hours")).toBeUndefined();
  });
  it("flags a postal code mismatch", () => {
    const live = { storefrontAddress: { addressLines: ["12 Main St"], locality: "Buffalo", administrativeArea: "NY", postalCode: "14202" } };
    expect(compareGoogle(base, live, TODAY).find(item => item.fact === "address")?.state).toBe("differs");
  });
  it("never reports differs from absence", () => {
    const list = compareGoogle(base, {}, TODAY);
    expect(list.find(item => item.fact === "phone")?.state).toBe("not_shown");
    expect(list.find(item => item.fact === "hours")?.state).toBe("not_shown");
    expect(list.find(item => item.fact === "address")?.state).toBe("not_shown");
  });
});

describe("compareBooking", () => {
  it("differs on hours outside the record and follows for the rest", () => {
    const list = compareBooking(base, { hours: HOURS }, [{ day: 1, opens: "18:00", closes: "20:00" }]);
    expect(list.find(item => item.fact === "hours")).toMatchObject({ state: "differs", shown: "Monday 18:00–20:00", expected: "Inside your hours" });
    expect(list.filter(item => item.fact !== "hours").every(item => item.state === "follows")).toBe(true);
  });
  it("follows when nothing is outside, and omits a record with no hours", () => {
    expect(compareBooking(base, { hours: HOURS }, []).find(item => item.fact === "hours")?.state).toBe("follows");
    expect(compareBooking(expectedFacts(confirmed({}), TODAY), { hours: null }, [])).toEqual([]);
  });
});

describe("compareYelp", () => {
  it("maps Yelp day 0 to the record's Monday", () => {
    const same = { hours: [{ open: [{ day: 0, start: "0900", end: "1700" }, { day: 1, start: "0900", end: "1700" }] }] };
    expect(compareYelp(base, same).find(item => item.fact === "hours")?.state).toBe("matches");
    const off = { hours: [{ open: [{ day: 0, start: "1000", end: "1700" }] }] };
    expect(compareYelp(base, off).find(item => item.fact === "hours")?.state).toBe("differs");
  });
  it("compares phone and leaves the rest not checked", () => {
    const list = compareYelp(base, { phone: "+17165550199" });
    expect(list.find(item => item.fact === "phone")?.state).toBe("differs");
    expect(list.find(item => item.fact === "services")?.state).toBe("not_checked");
  });
});
