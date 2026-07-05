import { describe, expect, it } from "vitest";

import { injectGa4Tag } from "../../custom-repo-starter/ScaffoldGA4";

/** Minimal fake DOM: enough for injectGa4Tag's getElementById/createElement/append. */
function fakeDoc() {
  const byId = new Map<string, { id: string; src: string; async: boolean }>();
  const appended: { id: string; src: string; async: boolean }[] = [];
  const head = {
    appendChild: (el: { id: string; src: string; async: boolean }) => {
      appended.push(el);
      if (el.id) byId.set(el.id, el);
      return el;
    },
  };
  const doc = {
    appended,
    getElementById: (id: string) => byId.get(id) ?? null,
    createElement: () => ({ id: "", src: "", async: false }),
    head,
    documentElement: head,
  };
  return doc as unknown as Document & { appended: typeof appended };
}

type GtagWin = { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };

describe("injectGa4Tag", () => {
  it("no-ops when the measurement id is empty (analytics unset)", () => {
    const win: GtagWin = {};
    const doc = fakeDoc();

    const injected = injectGa4Tag(win as never, doc, "");

    expect(injected).toBe(false);
    expect(doc.appended).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
    expect(win.gtag).toBeUndefined();
  });

  it("no-ops on whitespace-only id", () => {
    const doc = fakeDoc();
    expect(injectGa4Tag({} as never, doc, "   ")).toBe(false);
    expect(doc.appended).toHaveLength(0);
  });

  it("injects the gtag.js loader and initializes GA4 when an id is set", () => {
    const win: GtagWin = {};
    const doc = fakeDoc();

    const injected = injectGa4Tag(win as never, doc, "G-ABC12345");

    expect(injected).toBe(true);
    // Exactly one external loader, pointed at googletagmanager with the id.
    expect(doc.appended).toHaveLength(1);
    expect(doc.appended[0].src).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-ABC12345",
    );
    expect(doc.appended[0].async).toBe(true);
    // gtag stub wired + `js`/`config` commands queued on dataLayer.
    expect(typeof win.gtag).toBe("function");
    expect(win.dataLayer).toHaveLength(2);
    const config = win.dataLayer![1] as IArguments;
    expect(config[0]).toBe("config");
    expect(config[1]).toBe("G-ABC12345");
  });

  it("is idempotent — a second call does not double-inject", () => {
    const win: GtagWin = {};
    const doc = fakeDoc();

    expect(injectGa4Tag(win as never, doc, "G-ABC12345")).toBe(true);
    expect(injectGa4Tag(win as never, doc, "G-ABC12345")).toBe(false);
    expect(doc.appended).toHaveLength(1);
  });
});
