import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicBusinessVerification, VERIFICATION_MAX_AGE_MS, verifiedProfileUrls } from "@/platform/business-record/verification";
import { BusinessVerification } from "@/experience/business-record/BusinessVerification";
import { businessJsonLd } from "@/products/connected-sites/contracts";
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
import { readPublicBusinessVerification } from "@/products/connected-sites/public-verification";

const now = Date.parse("2026-10-08T12:00:00Z");
const fresh = "2026-10-08T10:00:00Z";
const ws = "64000000-0000-4000-8000-000000000110";
const evidence = {
  domains: [{ url: "https://fictional.example/", checkedAt: fresh }],
  googleBusinessProfile: { linked: true, checkedAt: fresh },
  ownerConfirmedFactCount: 3, lastConfirmedAt: fresh,
  operatingAgency: { name: "Fictional Agency" },
};
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => { vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1"); vi.stubEnv("STRELVA_BUSINESS_PAGES", "1"); });

describe("public verification claims", () => {
  it("names separate recent evidence without claiming Google or the whole business is verified", () => {
    const verification = publicBusinessVerification(evidence, now);
    expect(verification.domains[0]).toMatchObject({ verified: true, stale: false });
    expect(verification.googleBusinessProfile).toEqual({ linked: true, verified: null, checkedAt: fresh, stale: false });
    expect(verification.ownerConfirmedFactCount).toBe(3);
    const ld = businessJsonLd({ name: "Fictional", social_links: ["https://social.example/fictional"] }, "https://app.example/biz/fictional", verification);
    expect(ld?.sameAs).toEqual(["https://social.example/fictional", "https://fictional.example/"]);
    expect(ld).not.toHaveProperty("verified");
    const html = renderToStaticMarkup(<BusinessVerification verification={verification} />);
    for (const text of ["fictional.example", "Google verification unknown", "Fictional Agency", "October 8, 2026"]) expect(html).toContain(text);
  });
  it("never treats stale or future outside proof as verified, while preserving dated owner confirmation", () => {
    for (const checkedAt of [new Date(now - VERIFICATION_MAX_AGE_MS - 1).toISOString(), new Date(now + 1).toISOString()]) {
      const value = publicBusinessVerification({ ...evidence, domains: [{ url: "https://fictional.example/", checkedAt }], googleBusinessProfile: { linked: true, checkedAt } }, now);
      expect(value.domains[0]).toMatchObject({ verified: false, stale: true });
      expect(value.googleBusinessProfile).toMatchObject({ linked: true, verified: null, stale: true });
      expect(verifiedProfileUrls(value)).toEqual([]);
      expect(businessJsonLd({ name: "Fictional" }, null, value)).not.toHaveProperty("sameAs");
      expect(value.ownerConfirmedFactCount).toBe(3);
    }
  });
  it("does not promote generic hosted saves without a dedicated proof timestamp", () => {
    const value = publicBusinessVerification({ ...evidence, domains: [{ url: "https://fictional.example/", checkedAt: null }] }, now);
    expect(value.domains[0]).toMatchObject({ verified: false, checkedAt: null, stale: true });
    expect(verifiedProfileUrls(value)).toEqual([]);
  });
  it("keeps missing or malformed evidence unknown, including scraped assertions and private fields", () => {
    for (const raw of [null, {}, { ...evidence, verified: true }, { ...evidence, operatingAgency: { name: "Fictional", email: "secret@example.test" } }, { ...evidence, domains: [{ url: "https://user:secret@example.test/", checkedAt: fresh }] }]) {
      expect(publicBusinessVerification(raw, now)).toEqual(publicBusinessVerification(null));
    }
    const html = renderToStaticMarkup(<BusinessVerification />);
    expect(html).toContain("Confirmation evidence unavailable");
    expect(html).not.toContain(" — verified");
  });
  it("revoked provider/domain projections remove their claims immediately", () => {
    const value = publicBusinessVerification({ ...evidence, domains: [], googleBusinessProfile: { linked: false, checkedAt: null }, operatingAgency: null }, now);
    expect(verifiedProfileUrls(value)).toEqual([]);
    expect(value.googleBusinessProfile).toMatchObject({ linked: false, verified: null });
    expect(renderToStaticMarkup(<BusinessVerification verification={value} />)).not.toContain("Fictional Agency");
  });
});

describe("anonymous public reader", () => {
  const rpc = vi.fn(async () => ({ data: { workspaceId: ws, verification: evidence }, error: null }));
  it("uses a public handle and returns only the bounded block after per-business consent", async () => {
    const value = await readPublicBusinessVerification({ handle: "fictional" }, { db: { rpc }, publicFor: async id => id === ws, now });
    expect(value.ownerConfirmedFactCount).toBe(3);
    expect(JSON.stringify(value)).not.toContain(ws);
    expect(rpc).toHaveBeenCalledWith("read_public_business_verification", { p_handle: "fictional", p_tenant_id: null });
  });
  it("returns unknown for unpublished, closed, store failure or malformed responses", async () => {
    const unknown = publicBusinessVerification(null);
    expect(await readPublicBusinessVerification({ tenantId: "fixture" }, { db: { rpc }, publicFor: async () => false })).toEqual(unknown);
    for (const reply of [{ data: null, error: null }, { data: evidence, error: null }, { data: null, error: { message: "PRIVATE_DB_ERROR" } }]) {
      expect(await readPublicBusinessVerification({ handle: "fictional" }, { db: { rpc: async () => reply }, publicFor: async () => true })).toEqual(unknown);
    }
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "0");
    const never = vi.fn();
    expect(await readPublicBusinessVerification({ handle: "fictional" }, { db: { rpc: never } })).toEqual(unknown);
    expect(never).not.toHaveBeenCalled();
  });
});
