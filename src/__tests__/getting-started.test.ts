import { describe, expect, it, vi } from "vitest";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { BusinessRecordConflictError } from "@/platform/business-record/repository";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import type { BusinessFacts } from "@/products/websites/rebuild-pipeline";
import { WebsiteCrawlError } from "@/products/websites/rebuild-crawl";
import { confirmedPatch, foundFactsFromReading } from "@/products/getting-started/found-facts";
import { foundFactInputSchema } from "@/products/getting-started/contracts";
import { businessWebsite, normalizeBusinessWebsite, sameWebsite, websiteHost, websiteLinks } from "@/products/getting-started/website";
import { createGettingStarted, GettingStartedInputError, GettingStartedRateLimitError, GettingStartedUnavailableError, type GettingStartedDeps } from "@/products/getting-started/server";

const USER = "5a000000-0000-4000-8000-000000000001";
const ACTOR = { userId: USER, verifiedEmail: "owner@northside.example" };
const BUSINESS = "5a000000-0000-4000-8000-0000000000b1";
const OTHER = "5a000000-0000-4000-8000-0000000000b2";
const SCAN = "scan_abc123";
const AUDIT = `audit_${"a".repeat(32)}`;

function record(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return { workspaceId: BUSINESS, access: "owner", revision: 3, lastSequence: 3, updatedAt: null, facts: {}, services: [], people: [], contactCount: 0, ...over };
}
const fact = (value: unknown) => ({ value, source: "owner" as const, verified: false, updatedAt: "2026-10-12T00:00:00.000Z" }) as unknown as NonNullable<BusinessRecord["facts"]["phone"]>;

function reading(): BusinessFacts {
  const src = (quote: string) => [{ sourceId: "p1", quote }];
  return {
    name: "Northside Bakery", nameFactId: "n", facts: {
      n: { text: "Northside Bakery", kind: "claim", highRisk: false, origin: "source", sources: src("Northside Bakery") },
      c1: { text: "(716) 555-0100", kind: "contact", highRisk: false, origin: "source", sources: src("Call (716) 555-0100") },
      c2: { text: "Hello@Northside.example", kind: "contact", highRisk: false, origin: "source", sources: [{ sourceId: "p2", quote: "Hello@Northside.example" }] },
      l1: { text: "12 Elm St, Buffalo, NY 14201", kind: "location", highRisk: false, origin: "source", sources: src("12 Elm St, Buffalo, NY 14201") },
      s1: { text: "Custom cakes", kind: "service", highRisk: false, origin: "source", sources: src("Custom cakes") },
      s2: { text: "Bread", kind: "service", highRisk: false, origin: "source", sources: src("Bread") },
    },
    services: ["s1", "s2"], people: [], contact: ["c1", "c2"], hours: [], locations: ["l1"], reviews: [], claims: ["n"], brandColors: [], oldPaths: [],
    sourcePages: [{ sourceId: "p1", url: "https://northside.example/", title: "Home", factIds: [] }, { sourceId: "p2", url: "https://northside.example/contact", title: "Contact", factIds: [] }],
  };
}

function deps(over: Partial<GettingStartedDeps> = {}): GettingStartedDeps {
  return {
    listWorkspaces: vi.fn().mockResolvedValue([]),
    readRecord: vi.fn().mockResolvedValue(record()),
    patchRecord: vi.fn().mockResolvedValue({ workspaceId: BUSINESS, sequence: 4, revision: 4, changeCount: 1, undoOf: null, contacts: { created: 0, merged: 0, unchanged: 0 }, replayed: false }),
    enterBusiness: vi.fn().mockResolvedValue({ workspaceId: BUSINESS, requestId: null, alreadyCreated: false }),
    readScan: vi.fn().mockResolvedValue({ id: SCAN, result: { business: "Northside Bakery", url: "https://www.northside.example", score: 40, grade: "D", verdict: "v", signals: [], citation: { probed: false, mentioned: false, recommended: false, note: "" }, topFix: "Add structured data" }, input: {}, createdAt: "2026-10-12T00:00:00.000Z" }),
    readAudit: vi.fn().mockResolvedValue({ url: "https://northside.example/" }),
    saveScan: vi.fn().mockResolvedValue({ work: { id: "w-scan" } }),
    saveAudit: vi.fn().mockResolvedValue({ id: "w-audit" }),
    crawl: vi.fn().mockResolvedValue({ pages: [{}, {}], skipped: [], assets: [], crawledAt: "", bytes: 0, elapsedMs: 0, limited: false }),
    extract: vi.fn().mockReturnValue(reading()),
    rateLimited: vi.fn().mockResolvedValue(false),
    ...over,
  } as GettingStartedDeps;
}
const owned = (id: string, name = "Northside Bakery") => ({ id, kind: "customer", name, createdBy: USER, createdAt: "", updatedAt: "", role: "owner", access: "member" });

describe("one website on the business record", () => {
  it("reads, normalizes and compares the website link", () => {
    expect(businessWebsite(record())).toBeNull();
    expect(businessWebsite(record({ facts: { links: fact([{ kind: "instagram", url: "https://instagram.com/x" }, { kind: "website", url: "https://northside.example/" }]) } }))).toBe("https://northside.example/");
    expect(normalizeBusinessWebsite("northside.example")).toBe("https://northside.example/");
    expect(normalizeBusinessWebsite("ftp://northside.example")).toBeNull();
    expect(normalizeBusinessWebsite("http://localhost:3000")).toBeNull();
    expect(sameWebsite("https://www.northside.example/", "northside.example")).toBe(true);
    expect(sameWebsite("https://northside.example/", "https://other.example/")).toBe(false);
    expect(websiteHost("https://www.northside.example/menu")).toBe("northside.example");
  });

  it("keeps other links and is a no-op for the same site", () => {
    const withLinks = record({ facts: { links: fact([{ kind: "instagram", url: "https://instagram.com/x" }]) } });
    expect(websiteLinks(withLinks, "northside.example")).toEqual([{ kind: "website", url: "https://northside.example/" }, { kind: "instagram", url: "https://instagram.com/x" }]);
    expect(websiteLinks(record({ facts: { links: fact([{ kind: "website", url: "https://www.northside.example" }]) } }), "https://northside.example/")).toBeNull();
  });
});

describe("found facts (the shared Found-fact shape)", () => {
  const key = (item: { entity: string; key?: string }) => item.entity === "fact" ? item.key : item.entity;
  it("offers only record-shaped facts, each with its page and quote, in L3's input shape", () => {
    const facts = foundFactsFromReading(reading(), record());
    expect(facts.map(item => [key(item), item.display])).toEqual([
      ["phone", "(716) 555-0100"], ["email", "hello@northside.example"],
      ["address", "12 Elm St, Buffalo, NY 14201"], ["service", "Custom cakes"], ["service", "Bread"],
    ]);
    expect(facts.find(item => key(item) === "email")).toMatchObject({ entity: "fact", key: "email", sourceUrl: "https://northside.example/contact", quote: "Hello@Northside.example" });
    expect(facts.find(item => item.display === "Bread")).toMatchObject({ entity: "service", value: { name: "Bread" } });
    for (const item of facts) {
      const { id: _id, label: _label, display: _display, current: _current, ...input } = item;
      expect(foundFactInputSchema.safeParse(input).success).toBe(true);
    }
  });

  it("skips what the record already holds and shows what a fact would replace", () => {
    const facts = foundFactsFromReading(reading(), record({
      facts: { phone: fact("716-555-0199"), email: fact("hello@northside.example") },
      services: [{ id: "5a000000-0000-4000-8000-0000000000c1", name: "bread", description: null, durationMinutes: null, priceText: null, active: true, position: 0, externalRef: null, source: "owner", verified: false, updatedAt: "2026-10-12T00:00:00.000Z" }],
    }));
    expect(facts.some(item => key(item) === "email")).toBe(false);
    expect(facts.find(item => key(item) === "phone")?.current).toBe("716-555-0199");
    expect(facts.filter(item => item.entity === "service").map(item => item.display)).toEqual(["Custom cakes"]);
  });

  it("builds the owner's write from ticked facts only, revalidating each value", () => {
    const src = { sourceUrl: "https://northside.example/", quote: "q" };
    const planned = confirmedPatch(record(), [
      { entity: "fact", key: "phone", value: "(716) 555-0100", ...src },
      { entity: "service", value: { name: "Custom cakes" }, ...src },
      { entity: "service", value: { name: "custom cakes" }, ...src },
    ], "northside.example");
    expect(planned).toEqual({ kind: "patch", keys: ["phone", "links", "services"], patch: {
      facts: { phone: { value: "(716) 555-0100" }, links: { value: [{ kind: "website", url: "https://northside.example/" }] } },
      services: [{ op: "upsert", name: "Custom cakes" }],
    } });
    expect(confirmedPatch(record(), [{ entity: "fact", key: "email", value: "not an email", ...src }])).toMatchObject({ kind: "invalid" });
    expect(confirmedPatch(record(), [{ entity: "fact", key: "hours", value: { weekly: [] }, ...src }])).toMatchObject({ kind: "invalid" });
    expect(confirmedPatch(record({ facts: { phone: fact("(716) 555-0100") } }), [{ entity: "fact", key: "phone", value: "(716) 555-0100", ...src }])).toEqual({ kind: "unchanged" });
  });
});

describe("check to business", () => {
  it("creates the business from the check's name, records its website as the owner's, and saves the check into it", async () => {
    const d = deps();
    const service = createGettingStarted(d);
    const started = await service.startFromCheck(ACTOR, { resultId: SCAN, name: "Northside Bakery" });
    expect(started).toEqual({ workspaceId: BUSINESS, workId: "w-scan", reused: false, alreadyCreated: false });
    const entry = vi.mocked(d.enterBusiness).mock.calls[0]![1] as { destination: unknown; initialRequest: unknown; idempotencyKey: string };
    expect(entry).toMatchObject({ destination: { kind: "new", name: "Northside Bakery" }, initialRequest: null });
    expect(vi.mocked(d.patchRecord)).toHaveBeenCalledWith(ACTOR, BUSINESS, 3, { facts: { links: { value: [{ kind: "website", url: "https://www.northside.example/" }] } } }, expect.objectContaining({ source: "owner" }));
    expect(vi.mocked(d.saveScan)).toHaveBeenCalledWith({ actor: ACTOR, workspaceId: BUSINESS, resultId: SCAN });

    // A retry sends the same command, so the database returns the same business.
    await service.startFromCheck(ACTOR, { resultId: SCAN, name: "Northside Bakery" });
    const retry = vi.mocked(d.enterBusiness).mock.calls[1]![1] as { idempotencyKey: string };
    expect(retry.idempotencyKey).toBe(entry.idempotencyKey);
    expect(entry.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses the owner's business with the same website instead of creating another", async () => {
    const d = deps({
      listWorkspaces: vi.fn().mockResolvedValue([owned(OTHER, "Elsewhere"), owned(BUSINESS)]),
      readRecord: vi.fn(async (_actor, id: string) => id === BUSINESS ? record({ facts: { links: fact([{ kind: "website", url: "https://northside.example/" }]) } }) : record({ workspaceId: OTHER })),
    });
    const started = await createGettingStarted(d).startFromCheck(ACTOR, { resultId: AUDIT, name: "northside.example" });
    expect(started).toMatchObject({ workspaceId: BUSINESS, workId: "w-audit", reused: true });
    expect(d.enterBusiness).not.toHaveBeenCalled();
    expect(d.patchRecord).not.toHaveBeenCalled();
    expect(d.saveAudit).toHaveBeenCalledWith({ actor: ACTOR, workspaceId: BUSINESS, resultId: AUDIT });
  });

  it("never replaces a different website already on the record", async () => {
    const d = deps({ readRecord: vi.fn().mockResolvedValue(record({ facts: { links: fact([{ kind: "website", url: "https://other.example/" }]) } })) });
    await createGettingStarted(d).startFromCheck(ACTOR, { resultId: SCAN, name: "Northside Bakery" });
    expect(d.patchRecord).not.toHaveBeenCalled();
    expect(d.saveScan).toHaveBeenCalled();
  });

  it("retries the website write once on a revision conflict", async () => {
    const patch = vi.fn().mockRejectedValueOnce(new BusinessRecordConflictError("business_record_revision_conflict", "changed")).mockResolvedValue({ revision: 5 });
    const d = deps({ patchRecord: patch as unknown as GettingStartedDeps["patchRecord"] });
    await createGettingStarted(d).startFromCheck(ACTOR, { resultId: SCAN, name: "Northside Bakery" });
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("refuses an expired or forged check before creating anything", async () => {
    const d = deps({ readScan: vi.fn().mockResolvedValue({ id: "scan_other", result: {} }) });
    await expect(createGettingStarted(d).startFromCheck(ACTOR, { resultId: SCAN, name: "X" })).rejects.toBeInstanceOf(GettingStartedUnavailableError);
    await expect(createGettingStarted(deps()).startFromCheck(ACTOR, { resultId: "scan_bad!", name: "X" })).rejects.toBeInstanceOf(GettingStartedUnavailableError);
    expect(d.enterBusiness).not.toHaveBeenCalled();
  });

  it("previews an audit with a host-based name and no business name", async () => {
    expect(await createGettingStarted(deps()).readCheck(AUDIT)).toEqual({ resultId: AUDIT, kind: "website_audit", name: null, website: "https://northside.example/" });
  });
});

describe("Use my current website", () => {
  const member = () => deps({ listWorkspaces: vi.fn().mockResolvedValue([owned(BUSINESS)]) });

  it("reads the site into found facts and writes nothing", async () => {
    const d = member();
    const result = await createGettingStarted(d).readWebsite(ACTOR, BUSINESS, "northside.example");
    expect(result).toMatchObject({ url: "https://northside.example/", revision: 3, pagesRead: 2 });
    expect(result.facts.length).toBe(5);
    expect(d.crawl).toHaveBeenCalledWith("https://northside.example/", { maxPages: 5, timeoutMs: 15_000, maxBytes: 2_000_000 });
    expect(d.patchRecord).not.toHaveBeenCalled();
  });

  it("refuses non-owners, other businesses, bad addresses and too many reads", async () => {
    const admin = member(); vi.mocked(admin.readRecord).mockResolvedValue(record({ access: "admin" }));
    await expect(createGettingStarted(admin).readWebsite(ACTOR, BUSINESS, "northside.example")).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(createGettingStarted(deps()).readWebsite(ACTOR, BUSINESS, "northside.example")).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(createGettingStarted(member()).readWebsite(ACTOR, BUSINESS, "ftp://northside.example")).rejects.toBeInstanceOf(GettingStartedInputError);
    const limited = member(); vi.mocked(limited.rateLimited).mockResolvedValue(true);
    await expect(createGettingStarted(limited).readWebsite(ACTOR, BUSINESS, "northside.example")).rejects.toBeInstanceOf(GettingStartedRateLimitError);
    expect(limited.crawl).not.toHaveBeenCalled();
  });

  it("reports an unreadable site without throwing a raw error", async () => {
    const d = member(); vi.mocked(d.crawl).mockRejectedValue(new WebsiteCrawlError("robots_blocked", "This website asks crawlers not to read it."));
    await expect(createGettingStarted(d).readWebsite(ACTOR, BUSINESS, "northside.example")).rejects.toThrow("This website asks crawlers not to read it.");
  });

  it("confirms only the ticked facts as the owner's own write against the revision shown", async () => {
    const d = member();
    const saved = await createGettingStarted(d).confirm(ACTOR, { workspaceId: BUSINESS, revision: 3, website: "northside.example", facts: [{ entity: "fact", key: "email", value: "hello@northside.example", sourceUrl: "https://northside.example/contact", quote: "hello" }] });
    expect(saved).toEqual({ saved: ["email", "links"], revision: 4 });
    expect(d.patchRecord).toHaveBeenCalledWith(ACTOR, BUSINESS, 3, { facts: { email: { value: "hello@northside.example" }, links: { value: [{ kind: "website", url: "https://northside.example/" }] } } }, expect.objectContaining({ source: "owner" }));
  });

  it("refuses a stale reading and a non-owner confirmation", async () => {
    await expect(createGettingStarted(member()).confirm(ACTOR, { workspaceId: BUSINESS, revision: 2, facts: [{ entity: "fact", key: "email", value: "hello@northside.example", sourceUrl: "https://northside.example/contact", quote: "hello" }] })).rejects.toBeInstanceOf(WorkspaceConflictError);
    const admin = member(); vi.mocked(admin.readRecord).mockResolvedValue(record({ access: "admin" }));
    await expect(createGettingStarted(admin).confirm(ACTOR, { workspaceId: BUSINESS, revision: 3, facts: [{ entity: "fact", key: "email", value: "hello@northside.example", sourceUrl: "https://northside.example/contact", quote: "hello" }] })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(admin.patchRecord).not.toHaveBeenCalled();
  });
});
