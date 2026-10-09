import { describe, expect, it } from "vitest";
import { siteChangeProviderFromOptions } from "@/platform/service-requests/provider-options";
const seat = (agencyWorkspaceId: string, providerOfRecord = false) => ({ agencyWorkspaceId, name: "Agency", providerOfRecord });
describe("site change current agency selection", () => {
  it("uses a provider of record only when present in current granted seats", () => {
    expect(siteChangeProviderFromOptions([seat("other"), seat("current", true)])).toEqual({ kind: "agency", agencyWorkspaceId: "current" });
  });
  it("uses a sole granted agency without inventing a provider identity", () => {
    expect(siteChangeProviderFromOptions([seat("sole")])).toEqual({ kind: "agency", agencyWorkspaceId: "sole" });
  });
  it("refuses absent and ambiguous qualified agencies", () => {
    expect(() => siteChangeProviderFromOptions([])).toThrow("active provider seat");
    expect(() => siteChangeProviderFromOptions([seat("one"), seat("two")])).toThrow("Choose one agency");
    expect(() => siteChangeProviderFromOptions([seat("one", true), seat("two", true)])).toThrow("Choose one agency");
  });
});
