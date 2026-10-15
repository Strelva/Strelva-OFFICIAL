import { describe, expect, it, vi } from "vitest";
vi.mock("@/products/connected-sites/server", () => ({ fetchLiveSitePage: vi.fn(async () => null) }));
import { checkIntakeOnPage } from "@/products/vertical-intake/live-check";

const input = { url: "https://north.example/visit", siteKey: "sk_pub_abcdefghijklmnopqrstuvwx", appId: "dental_intake" as const, release: 1 };

describe("checkIntakeOnPage", () => {
  it("finds the form when the mount marker and the site key are both on the page", async () => {
    const html = `<script src="x/connect.js" data-strelva-site="${input.siteKey}"></script><div data-strelva-app="dental_intake"></div>`;
    expect(await checkIntakeOnPage(input, async () => html)).toMatchObject({ state: "found", url: input.url, release: 1 });
  });

  it("finds a code site's server-rendered markers", async () => {
    const html = `<section data-strelva-app='dental_intake' data-strelva-site="${input.siteKey}"></section>`;
    expect((await checkIntakeOnPage(input, async () => html)).state).toBe("found");
  });

  it("does not see the form when the marker is there but the key is not, or the reverse", async () => {
    expect((await checkIntakeOnPage(input, async () => '<div data-strelva-app="dental_intake"></div>')).state).toBe("not_seen");
    expect((await checkIntakeOnPage(input, async () => `<script data-strelva-site="${input.siteKey}"></script>`)).state).toBe("not_seen");
    expect((await checkIntakeOnPage(input, async () => `<div data-strelva-app="other"></div>${input.siteKey}`)).state).toBe("not_seen");
  });

  it("says unreachable when the page can't be read", async () => {
    expect((await checkIntakeOnPage(input, async () => null)).state).toBe("unreachable");
    expect((await checkIntakeOnPage(input, async () => { throw new Error("boom"); })).state).toBe("unreachable");
  });

  it("stamps when it looked", async () => {
    const check = await checkIntakeOnPage({ ...input, release: null }, async () => "");
    expect(check.release).toBeNull();
    expect(Number.isNaN(Date.parse(check.checkedAt))).toBe(false);
  });
});
