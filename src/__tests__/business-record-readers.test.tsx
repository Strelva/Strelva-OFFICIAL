import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readReleasedTenantBusinessContext, contentWithBusinessRecord } from "@/lib/business-record-reader";
import { releasedOwnerNoticeEmail, setOwnerRecipientResolver } from "@/lib/owner-recipient";
import { setBusinessRecordDb } from "@/platform/business-record/repository";
import { readTenantBusinessContext } from "@/platform/business-record/service";
import { siteWithBusinessRecord } from "@/products/websites/business-record";
import { SiteRenderer } from "@/products/websites/SiteRenderer";
import { siteDocumentSchema, siteDocumentHash } from "@/products/websites/site-document";
import { defaults } from "@/lib/defaults";
import type { TenantBusinessContext } from "@/lib/workspace-ports";

const context: TenantBusinessContext = { revision: 3, facts: { display_name: "Fresh name", email: "public@example.test", phone: "+17165550100", address: { formatted: "12 Main St" }, hours: { timezone: "America/New_York", weekly: [{ day: 1, opens: "10:00", closes: "16:00" }] } }, services: [{ id: "e0000000-0000-4000-8000-000000000001", name: "Consult", description: "Current service", priceText: "$80" }] };
const document = siteDocumentSchema.parse({ version: 2, siteName: "Old name", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Old name", description: "Published", root: "root" }], nodes: { root: { id: "root", type: "Section", variant: "container", props: {}, children: ["header", "hours"] }, header: { id: "header", type: "Header", variant: "logo-left", props: { brand: "Old name" } }, hours: { id: "hours", type: "Hours", variant: "table", props: { rows: [{ day: "Monday", hours: "09:00–17:00" }] } } }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" } });
const rpc = vi.fn();
beforeEach(() => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_BUSINESS_RECORD_READS", "1"); rpc.mockReset(); setBusinessRecordDb({ rpc }); });
afterEach(() => { setBusinessRecordDb(null); setOwnerRecipientResolver(null); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("one business record readers", () => {
  it("flags off never touch the database or change legacy recipient spelling", async () => {
    vi.stubEnv("STRELVA_BUSINESS_RECORD_READS", "0");
    const resolver = vi.fn(); setOwnerRecipientResolver(resolver);
    expect(await readReleasedTenantBusinessContext("fixture")).toBeNull();
    expect(await releasedOwnerNoticeEmail({ id: "fixture", ownerEmail: "Old@Example.test " })).toBe("Old@Example.test ");
    expect(rpc).not.toHaveBeenCalled(); expect(resolver).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_BUSINESS_RECORD_READS", "1"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect(await readReleasedTenantBusinessContext("fixture")).toBeNull(); expect(rpc).not.toHaveBeenCalled();
  });
  it("reads fresh public facts through the port and fails soft on missing migration", async () => {
    rpc.mockResolvedValue({ data: context, error: null });
    expect(await readReleasedTenantBusinessContext("fixture")).toEqual(context);
    expect(rpc).toHaveBeenCalledWith("read_tenant_business_context", { p_tenant_id: "fixture" });
    rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    expect(await readReleasedTenantBusinessContext("fixture")).toBeNull();
    expect(contentWithBusinessRecord("contact", defaults.contact, null)).toBe(defaults.contact);
  });
  it("bounds an unavailable record lookup and keeps the existing website", async () => {
    vi.useFakeTimers(); rpc.mockReturnValue(new Promise(() => undefined));
    const pending = readReleasedTenantBusinessContext("fixture");
    await vi.advanceTimersByTimeAsync(1500); expect(await pending).toBeNull();
  });
  it("strips private owner-recipient fields even from a malformed overbroad DB projection", async () => {
    rpc.mockResolvedValue({ data: { ...context, facts: { ...context.facts, owner_recipient: { email: "private@example.test" } }, contacts: [{ email: "private@example.test" }] }, error: null });
    expect(JSON.stringify(await readTenantBusinessContext("fixture"))).not.toContain("private");
  });
  it("uses the same record for public contact, settings and services without rewriting content", () => {
    const contact = contentWithBusinessRecord("contact", defaults.contact, context);
    expect(contact).toMatchObject({ email: "public@example.test", phone: "+17165550100", address: "12 Main St", hours: "Monday 10:00–16:00" });
    expect(contentWithBusinessRecord("settings", defaults.settings, context).siteName).toBe("Fresh name");
    expect(contentWithBusinessRecord("services", defaults.services, context).services[0]).toMatchObject({ name: "Consult", description: "Current service", price: "$80" });
    expect(defaults.contact).not.toBe(contact);
    expect(contentWithBusinessRecord("hero", defaults.hero, context)).toBe(defaults.hero);
  });
  it("renders current hours and name while retaining the issued approved document hash; preview stays issued", () => {
    const hash = siteDocumentHash(document);
    const html = renderToStaticMarkup(<SiteRenderer document={document} businessContext={context} contentHash={hash} />);
    expect(html).toContain("Fresh name"); expect(html).toContain("10:00–16:00"); expect(html).toContain(hash);
    expect(siteDocumentHash(document)).toBe(hash); expect(document.siteName).toBe("Old name");
    const preview = renderToStaticMarkup(<SiteRenderer document={document} businessContext={context} preview />);
    expect(preview).toContain("Old name"); expect(preview).not.toContain("Fresh name");
    expect(siteWithBusinessRecord(document, { ...context, facts: { display_name: "x".repeat(1000) } })).toBe(document);
  });
  it("new owner notice adapters fail closed when the recipient resolver fails after rollout", async () => {
    setOwnerRecipientResolver(async () => ({ email: "record@example.test", name: null, from: "record", workspaceId: "w" }));
    expect(await releasedOwnerNoticeEmail({ id: "fixture", ownerEmail: "old@example.test" })).toBe("record@example.test");
    setOwnerRecipientResolver(async () => { throw new Error("offline"); });
    expect(await releasedOwnerNoticeEmail({ id: "fixture", ownerEmail: "old@example.test" })).toBeNull();
  });
});
