import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import PlacesPreviewLayout from "@/app/preview/strelva/places/layout";

afterEach(() => vi.unstubAllEnvs());

describe("fictional workspace places label", () => {
  it("names the fictional evidence scope while retaining the original place content", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    vi.stubEnv("VERCEL_ENV", "");
    const html = renderToStaticMarkup(PlacesPreviewLayout({ children: createElement("main", null, "Original fictional inquiry") }));
    expect(html).toContain('role="note"');
    expect(html).toContain("Local rehearsal · fictional bakery records.");
    expect(html).toContain("not proof of email delivery or saved inquiry decisions");
    expect(html).toContain("<main>Original fictional inquiry</main>");
  });

  it.each([
    ["production", "production", "1"],
    ["development", "", "0"],
  ])("does not expose fixture content under %s / %s with opt-in %s", (node, hosted, optedIn) => {
    vi.stubEnv("NODE_ENV", node);
    vi.stubEnv("VERCEL_ENV", hosted);
    vi.stubEnv("STRELVA_UI_PREVIEW", optedIn);
    expect(() => PlacesPreviewLayout({ children: "Private fixture content" })).toThrow("NOT_FOUND");
  });
});
