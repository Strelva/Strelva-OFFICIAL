// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WebsitePanelsPreview, type WebsitePanelsView } from "@/experience/workspace/preview/WebsitePanelsPreview";

const views: WebsitePanelsView[] = ["media", "look", "articles", "results"];
function page(view: WebsitePanelsView, state: Parameters<typeof WebsitePanelsPreview>[0]["state"] = "ready", mode: "light" | "dark" = "light") {
  const node = document.createElement("div");
  node.innerHTML = renderToStaticMarkup(createElement(WebsitePanelsPreview, { view, state, mode }));
  return node;
}
describe("website canon fixture panels", () => {
  it.each(views)("labels %s as fictional and handles each unavailable state", view => {
    expect(page(view).textContent).toContain("Fictional preview · no live data or writes");
    expect(page(view, "loading").querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(page(view, "error").querySelector('[role="alert"]')?.textContent).toContain("Nothing about the site has changed");
    expect(page(view, "empty").textContent).toContain("No data recorded");
    expect(page(view, "permission").textContent).toContain("Only an owner or admin can change it");
  });
  it("blocks article publish for permission state while retaining the draft", () => {
    const node = page("articles", "permission");
    expect([...node.querySelectorAll("button")].find(button => button.textContent?.includes("Make it live"))?.disabled).toBe(true);
    expect(node.textContent).toContain("What happens in a mediation session");
  });
  it("gives the single visit series an accessible data summary", () => {
    const node = page("results");
    expect(node.querySelector('[role="img"][aria-label^="Weekly visits"]')?.getAttribute("aria-label")).toContain("32, 35, 28, 39, 49, 43, 33, 53, 60, 45, 57, 64");
    expect(node.querySelectorAll("table tbody tr")).toHaveLength(4);
    expect(node.textContent).toContain("Strelva can’t say that one caused the other");
  });
  it("places the explicit dark mode on the paper scope", () => {
    expect(page("look", "ready", "dark").querySelector('[data-workspace-theme="linen"][data-workspace-mode="dark"]')).not.toBeNull();
  });
});
