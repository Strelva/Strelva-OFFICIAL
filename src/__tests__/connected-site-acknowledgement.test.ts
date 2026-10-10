import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { systemOriginId } from "@/platform/systems/invariants";
import { exactBusinessPageUrl, expectedConnectedSiteSystemId } from "@/products/connected-sites/acknowledgement";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each([
  ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"],
  ["7a000000-0000-4000-8000-000000000001", "7a000000-0000-4000-8000-000000000003"],
])("matches the actual server System identity using real Web Crypto for %s", async (businessId, siteId) => {
  vi.stubGlobal("crypto", webcrypto);
  expect(await expectedConnectedSiteSystemId(businessId, siteId)).toBe(systemOriginId(businessId, { kind: "connected_site", ref: siteId }));
});
it.each(["https://app.strelva.com", "http://app.localhost:5500", "https://configured.example/app///"])("preserves server appOrigin compatibility for %s", origin => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  const expected = `${origin.replace(/\/+$/, "")}/biz/bread`;
  expect(exactBusinessPageUrl(expected, "bread")).toBe(true);
  expect(exactBusinessPageUrl(`${expected}?changed=1`, "bread")).toBe(false);
  expect(exactBusinessPageUrl(expected, "other")).toBe(false);
});
it.each(["javascript:alert(1)", "https://user:password@app.strelva.com/biz/bread", "not-a-url"])("refuses an unsafe acknowledgement URL %s", url => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.strelva.com");
  expect(exactBusinessPageUrl(url, "bread")).toBe(false);
});
