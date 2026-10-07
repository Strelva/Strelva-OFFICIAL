// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SiteDocumentTry } from "@/products/websites/SiteDocumentTry";
import { composeAskPageSet } from "@/products/websites/ask-page-set";

it("tries real native pages with keyboard-compatible links and no network or record writes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const document = composeAskPageSet("Example", { kind: "website-pages", pages: [
    { path: "/", title: "Home", description: "First page", paragraphs: ["Home page content"] },
    { path: "/services", title: "Services", description: "Second page", paragraphs: ["Real second page content"] },
  ] }).document;
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SiteDocumentTry, { document })));
    expect(container.textContent).toContain("Home page content");
    expect(container.textContent).not.toContain("Real second page content");
    const link = container.querySelector<HTMLAnchorElement>('a[href="/services"]')!;
    link.focus();
    expect(window.document.activeElement).toBe(link);
    await act(async () => link.click());
    expect(container.textContent).toContain("Real second page content");
    expect(container.textContent).not.toContain("Home page content");
    expect(container.querySelector("form")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
