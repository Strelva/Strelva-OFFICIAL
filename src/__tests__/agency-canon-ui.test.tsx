// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgencyCanonPreview } from "@/experience/workspace/preview/AgencyCanonPreview";
import { agencyCanonFrame, agencyCanonFrames, agencyCanonState } from "@/experience/workspace/preview/agency-canon-fixture";

afterEach(() => { document.body.innerHTML = ""; });
describe("fictional agency canon surfaces", () => {
  it("renders each frame with explicit local evidence boundaries and no invented royalty amount", () => {
    for (const frame of agencyCanonFrames) {
      const html = renderToStaticMarkup(createElement(AgencyCanonPreview, { frame, state: "ready", mode: "light" }));
      expect(html).toContain("Fictional preview");
      expect(html).toContain("no email or publication");
      expect(html).not.toMatch(/\b(?:AI|automation|workflow|task)\b/);
    }
    const html = renderToStaticMarkup(createElement(AgencyCanonPreview, { frame: "attribution", state: "ready", mode: "light" }));
    expect(html).toContain("[amount]");
    expect(html).toContain("not earnings");
  });
  it("keeps empty, unavailable and denied reads distinct for every frame", () => {
    for (const frame of agencyCanonFrames) {
      for (const state of ["loading", "empty", "error", "permission"] as const) {
        const html = renderToStaticMarkup(createElement(AgencyCanonPreview, { frame, state, mode: "light" }));
        expect(html).not.toContain("Hold to approve");
        expect(html).not.toContain("Send to Harbor Dental");
        if (state === "loading") expect(html).toContain("role=\"status\"");
        if (state === "error") expect(html).toContain("role=\"alert\"");
        if (state === "permission") expect(html).toContain("do not have permission");
      }
    }
  });
  it("records a typed yes as a preview request without approving the prepared change", async () => {
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(AgencyCanonPreview, { frame: "approval", state: "ready", mode: "light" })));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Ask Strelva"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(input, "yes"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("A typed yes does not approve");
    expect(container.textContent).toContain("Hold to approve");
    expect(container.textContent).not.toContain("Approved in preview");
    act(() => root.unmount());
  });
  it("normalizes unknown preview input to a ready client frame", () => {
    expect(agencyCanonFrame("unknown")).toBe("client");
    expect(agencyCanonState("unknown")).toBe("ready");
  });
});
