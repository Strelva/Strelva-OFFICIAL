import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lenis", () => ({}));
vi.mock("gsap", () => ({ default: { context: () => ({ revert: () => {} }), from: () => {} } }));

import { Providers } from "@/components/public/Providers";

describe("Providers on a client's public site", () => {
  it("renders no section while the provider list is empty", () => {
    const html = renderToStaticMarkup(
      <Providers providers={{ sectionLabel: "Providers", headline: "Trusted providers", description: "x", providers: [] }} />,
    );
    expect(html).toBe("");
    expect(html).not.toMatch(/coming soon/i);
  });

  it("renders listed providers", () => {
    const html = renderToStaticMarkup(
      <Providers
        providers={{
          sectionLabel: "Providers", headline: "Trusted providers", description: "x",
          providers: [{ id: "p1", name: "Sam Rivers", category: "yoga", service: "Vinyasa" } as never],
        }}
      />,
    );
    expect(html).toContain("Sam Rivers");
  });
});
