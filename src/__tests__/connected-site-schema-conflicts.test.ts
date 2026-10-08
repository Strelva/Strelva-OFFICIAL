import { afterEach, describe, expect, it, vi } from "vitest";
import { comparePlatformSchema, platformSchemaFromHtml, platformSchemaHintSchema, platformSchemaReportSchema } from "@/products/connected-sites/schema-facts";
import { recordPlatformSchema } from "@/products/connected-sites/schema-conflicts";
import { connectedSiteSchemaAdapter } from "@/platform/needs-you/sources/connected-site-schema";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";
import type { PublicFacts, ResolvedConnectedSite } from "@/products/connected-sites/contracts";
import { needsYouMemoryStore } from "./support/needs-you-memory";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { recordBeacon } from "@/products/connected-sites/server";

const site: ResolvedConnectedSite = { id: "78000000-0000-4000-8000-000000000003", workspaceId: "78000000-0000-4000-8000-000000000002", siteUrl: "https://bakery.example/", siteHost: "bakery.example", allowedOrigins: ["https://bakery.example"], injectSchema: true, captureForms: true, verified: true };
const facts: PublicFacts = { name: "Mooney Law", phone: "+1 (716) 555-0100", address: { street: "1 Main St", locality: "Buffalo", region: "NY", postalCode: "14201", country: "US" }, hours: [{ day: "mon", opens: "09:00", closes: "17:00" }, { day: "tue", closed: true }] };
const report = (businesses: unknown[]) => platformSchemaReportSchema.parse({ present: true, businesses });
const hint = { present: true };
const html = (name: string, url = "https://bakery.example/") => `<script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", "@id": url + "#business", url, name })}</script>`;
const record = (key: string, target: ResolvedConnectedSite, origin: string | null, _untrusted: unknown, store: ConnectedSitesStore, page = html("Old Mooney")) =>
  recordPlatformSchema(key, target, origin, hint, store, { fetchPage: async () => page });
afterEach(() => vi.unstubAllEnvs());

function setup() {
  vi.stubEnv("STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE", "1");
  const clock = { now: Date.parse("2026-10-07T12:00:00Z") };
  const memory = needsYouMemoryStore({ clock });
  const store = {
    context: vi.fn(async () => ({ revision: 1, facts: { display_name: "Mooney Law", phone: "7165550100" }, services: [], site: { injectSchema: true, captureForms: true } })),
    recordSchemaConflict: vi.fn(async (_key, _origin, item) => memory.store.open(site.workspaceId, item)),
    recordEvents: vi.fn(async () => 1),
  } as unknown as ConnectedSitesStore;
  return { clock, memory, store };
}

describe("published business schema comparison", () => {
  it("matches names, formatted phones, partial postal addresses and reordered schedule days", () => {
    expect(comparePlatformSchema(report([{ name: " MOONEY law ", telephone: "716-555-0100", address: { addressLocality: "buffalo", postalCode: "14201" }, openingHoursSpecification: [{ dayOfWeek: "https://schema.org/Monday", opens: "09:00:00", closes: "17:00:00" }] }]), facts)).toEqual([]);
  });
  it("compares name, phone, address and explicit hours, including closed days", () => {
    const result = comparePlatformSchema(report([{ name: "Wrong", telephone: "7165550199", address: { streetAddress: "2 Main St" }, openingHours: ["Mo 08:00-17:00", "Tu 09:00-17:00"] }]), facts);
    expect(result.map(row => row.field)).toEqual(["address.street", "hours.mon", "hours.tue", "name", "phone"]);
  });
  it("ignores missing and unsupported values rather than inventing disagreements", () => {
    expect(comparePlatformSchema(report([{}, { name: "Mooney Law", openingHours: "Call for hours" }, { openingHoursSpecification: [{ dayOfWeek: "Monday", opens: "9am" }] }]), facts)).toEqual([]);
    expect(comparePlatformSchema(report([{ name: "Guessed", telephone: "123" }]), {})).toEqual([]);
  });
  it("supports day ranges and multiple intervals without depending on graph order", () => {
    const full: PublicFacts = { hours: ["mon", "tue", "wed", "thu", "fri"].map(day => ({ day: day as "mon", opens: "09:00", closes: "17:00" })) };
    expect(comparePlatformSchema(report([{ openingHours: "Mo-Fr 09:00-17:00" }]), full)).toEqual([]);
    const split: PublicFacts = { hours: [{ day: "mon", opens: "09:00", closes: "12:00" }, { day: "mon", opens: "13:00", closes: "17:00" }] };
    expect(comparePlatformSchema(report([{ openingHours: ["Mo 13:00-17:00", "Mo 09:00-12:00"] }]), split)).toEqual([]);
  });
  it("parses server-fetched JSON-LD and compares only the connected site's entity", () => {
    const parsed = platformSchemaFromHtml(`<script type="application/ld+json">${JSON.stringify({ "@graph": [
      { "@type": "LocalBusiness", url: "https://bakery.example/other", name: "Sibling location" },
      { "@type": "LocalBusiness", "@id": "https://bakery.example/#main", url: "https://bakery.example/", name: "Wrong" },
    ] })}</script>`);
    expect(comparePlatformSchema(parsed, facts, site.siteUrl).map(item => item.field)).toEqual(["name"]);
    expect(comparePlatformSchema(report([{ name: "Wrong" }, { name: "Wrong sibling" }]), facts, site.siteUrl)).toEqual([]);
    expect(comparePlatformSchema(report([{ id: "https://publisher.example/#org", name: "Publisher" }]), facts, site.siteUrl)).toEqual([]);
    expect(platformSchemaHintSchema.safeParse({ present: true, businesses: [{ name: "forged" }] }).success).toBe(false);
  });
});

describe("record-only schema decision path", () => {
  it("records one deduplicated item across repeated reports, and never reopens an acknowledged revision", async () => {
    const { memory, store } = setup();
    const raw = report([{ name: "Old Mooney" }, { name: "Old Mooney" }]);
    await record("key", site, site.allowedOrigins[0]!, raw, store);
    await record("key", site, site.allowedOrigins[0]!, report([{ name: "OLD MOONEY" }]), store, html("OLD MOONEY"));
    expect(memory.items.size).toBe(1);
    const item = [...memory.items.values()][0]!;
    expect(item).toMatchObject({ route: "owner_decides", signInRequired: false, deliveryState: "not_sent" });
    await memory.store.claim({ workspaceId: site.workspaceId, itemId: item.id, revision: item.revisionHash, decision: "approve", by: "owner_link", recipient: "owner@example.test" });
    await record("key", site, site.allowedOrigins[0]!, raw, store);
    expect(memory.items.size).toBe(1);
    expect([...memory.items.values()][0]!.state).toBe("approved");
  });
  it("does nothing with flag off, matching facts, absent confirmed facts, or injection off", async () => {
    const { store } = setup();
    await record("key", site, null, report([{ name: "Mooney Law" }]), store, html("Mooney Law"));
    // The real context RPC filters unconfirmed agent facts (also proven in SQL).
    vi.mocked(store.context).mockResolvedValueOnce({ revision: 1, facts: {}, services: [], site: { injectSchema: true, captureForms: true } });
    await record("key", site, null, report([{ name: "Guessed Name" }]), store, html("Guessed Name"));
    vi.stubEnv("STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE", "0");
    await record("key", site, null, report([{ name: "Wrong" }]), store, null as unknown as string);
    vi.stubEnv("STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE", "1");
    await record("key", { ...site, injectSchema: false }, null, report([{ name: "Wrong" }]), store);
    expect(store.recordSchemaConflict).not.toHaveBeenCalled();
  });
  it("accepts report-only events additively and propagates storage failures", async () => {
    const { store } = setup();
    const deps = { fetchPage: async () => html("Wrong") };
    expect(await recordBeacon("key", site, site.allowedOrigins[0]!, { events: [], platformSchema: hint }, Date.now(), store, deps)).toBe(0);
    expect(store.recordEvents).not.toHaveBeenCalled();
    vi.mocked(store.recordSchemaConflict).mockRejectedValueOnce(new Error("db down"));
    await expect(recordBeacon("key", site, site.allowedOrigins[0]!, { events: [], platformSchema: hint }, Date.now(), store, deps)).rejects.toThrow("db down");
    await expect(recordBeacon("key", site, null, { events: [] }, Date.now(), store)).rejects.toThrow();
  });
  it("can acknowledge through the existing owner link without any owner membership or email send", async () => {
    const { memory, store, clock } = setup();
    await record("key", site, site.allowedOrigins[0]!, report([{ name: "Wrong" }]), store);
    const item = [...memory.items.values()][0]!;
    const sendEmail = vi.fn();
    const service = createNeedsYouService({ store: memory.store, adapters: [connectedSiteSchemaAdapter(async () => [...memory.items.values()].find(item => item.state === "open") ?? null)], now: () => clock.now, appOrigin: "https://app.example", sendEmail });
    const result = await service.decide({ workspaceId: site.workspaceId, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("done");
    expect(result.item?.outcomeReason).toContain("no facts changed");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("keeps already-recorded decisions resolvable when only new reports are disabled", async () => {
    vi.stubEnv("STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE", "0");
    const read = vi.fn(async () => ({ revisionHash: "a".repeat(64) }));
    const adapter = connectedSiteSchemaAdapter(read as never);
    await expect(adapter.currentRevision!({ workspaceId: site.workspaceId }, site.id)).resolves.toBe("a".repeat(64));
    expect(read).toHaveBeenCalledWith(site.workspaceId, site.id);
  });
  it("keeps client delivery suppressed by the existing rollout gate", async () => {
    const { memory, store, clock } = setup();
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    vi.stubEnv("APPROVE_LINK_SECRET", "fictional-schema-test-secret-at-least-32-chars");
    clock.now = Date.parse("2026-10-07T11:00:00Z"); // morning digest, New York
    await record("key", site, site.allowedOrigins[0]!, report([{ name: "Wrong" }]), store);
    const item = [...memory.items.values()][0]!;
    memory.store.dueForDelivery = async () => [{ ...item, businessName: "Fixture business", timezone: "America/New_York", recipient: { email: "owner@example.test", from: "business_record" } }];
    const delivery = vi.spyOn(memory.store, "recordDelivery");
    const service = createNeedsYouService({ store: memory.store, adapters: [connectedSiteSchemaAdapter(async () => item)], now: () => clock.now, appOrigin: "https://app.example", sendEmail: sendEmailWithReceipt });
    const result = await service.chase();
    expect(result.ownerNotTold).toBe(1);
    expect(delivery).toHaveBeenCalledWith(site.workspaceId, item.id, "digest", "suppressed", "owner@example.test", null, "email_suppressed_or_unconfigured");
  });

});
