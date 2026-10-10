import { describe, expect, it } from "vitest";
import { withPreviewRouteContext } from "@/experience/workspace/preview/route-context";

describe("preview route context", () => {
  it("keeps the selected fixture and explicit Systems setting on System deep links", () => {
    expect(withPreviewRouteContext(
      "/preview/strelva/workspace?view=system&system=site%3A1&workspaceId=business",
      { scenario: "mooney-member", systems: "on" },
    )).toBe("/preview/strelva/workspace?view=system&system=site%3A1&workspaceId=business&scenario=mooney-member&systems=on");
  });

  it("keeps an explicit Systems-off setting on Possibility Open links", () => {
    expect(withPreviewRouteContext(
      "/workspace?workspaceId=business&view=websites&work=rebuild",
      { scenario: "mooney", systems: "off" },
    )).toBe("/workspace?workspaceId=business&view=websites&work=rebuild&scenario=mooney&systems=off");
  });

  it("keeps existing preview aliases on the fixture route", () => {
    expect(withPreviewRouteContext(
      "/preview/strelva/workspace?view=system&system=site%3A1&workspaceId=business",
      { scenario: "mooney-member", systems: "on" },
    )).toBe("/preview/strelva/workspace?view=system&system=site%3A1&workspaceId=business&scenario=mooney-member&systems=on");
  });

  it("leaves production links byte-for-byte unchanged without preview context", () => {
    const href = "/workspace?view=system&system=site%3A1&workspaceId=business";
    expect(withPreviewRouteContext(href)).toBe(href);
  });

  it("does not attach preview state to external or non-workspace links", () => {
    const context = { scenario: "mooney", systems: "on" as const };
    expect(withPreviewRouteContext("https://example.com/workspace?view=system", context)).toBe("https://example.com/workspace?view=system");
    expect(withPreviewRouteContext("/preview/strelva/workspace/account", context)).toBe("/preview/strelva/workspace/account");
  });
});
