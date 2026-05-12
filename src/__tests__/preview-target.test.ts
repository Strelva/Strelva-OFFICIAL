import { describe, expect, it } from "vitest";
import { getLocalClientPreviewUrl } from "@/lib/preview-target";

describe("preview target selection", () => {
  it("uses the same-origin public site for local client fallback dashboards", () => {
    expect(
      getLocalClientPreviewUrl({
        clientFallbackRoot: "/client/gldf",
        requestHost: "localhost:3000",
        requestProto: "http",
      })
    ).toBe("http://localhost:3000");
  });

  it("keeps production fallback dashboards on their configured preview URL", () => {
    expect(
      getLocalClientPreviewUrl({
        clientFallbackRoot: "/client/gldf",
        requestHost: "scaffoldweb.com",
        requestProto: "https",
      })
    ).toBeNull();
  });

  it("ignores non-client dashboard roots", () => {
    expect(
      getLocalClientPreviewUrl({
        clientFallbackRoot: "",
        requestHost: "localhost:3000",
        requestProto: "http",
      })
    ).toBeNull();
  });
});
