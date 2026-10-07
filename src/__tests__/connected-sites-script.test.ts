// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scriptSource = readFileSync("public/connect.js", "utf8");
interface ConnectApi { consent(yes: boolean): void; track(kind: string, target?: string): void }

describe("the connected-site browser script", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); });

  async function install(consentRequired = false) {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const browser = frame.contentWindow!;
    const page = frame.contentDocument!;
    page.body.innerHTML = `<script src="https://app.strelva.com/connect.js" data-strelva-site="sk_pub_abcdefghijklmnopqrstuvwx"${consentRequired ? ' data-strelva-consent="required"' : ""}></script><div data-strelva-form></div><form id="existing"><input type="email" name="email" value="visitor@example.test"><textarea name="message">Please contact me</textarea></form>`;
    Object.defineProperty(page, "referrer", { value: "https://source.example/private?token=secret#details" });
    const request = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, json: async () => url.endsWith("/context") ? { site: { captureForms: true, injectSchema: false }, facts: {} } : { ok: true } }));
    Object.defineProperty(browser, "fetch", { value: request });
    runInNewContext(scriptSource, { window: browser, document: page, location: { href: "https://business.example/contact?private=1", pathname: "/contact" }, history: browser.history, navigator: browser.navigator, URL, Uint8Array, Promise, setTimeout, clearTimeout });
    const api = (browser as unknown as { strelva: ConnectApi }).strelva;
    page.dispatchEvent(new Event("DOMContentLoaded"));
    for (let step = 0; step < 5; step++) await Promise.resolve();
    const inquiries = () => request.mock.calls.filter(([url]) => url.endsWith("/inquiries"));
    return { page, api, request, inquiries };
  }

  function fillMounted(page: Document) {
    const form = page.querySelector<HTMLFormElement>("[data-strelva-form] form")!;
    form.querySelector<HTMLInputElement>('input[name="email"]')!.value = "visitor@example.test";
    form.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!.value = "Please contact me";
    return form;
  }

  it("sends both inquiry forms without referrer paths, query strings or fragments", async () => {
    const installed = await install();
    installed.page.querySelector("#existing")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    fillMounted(installed.page).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(installed.inquiries()).toHaveLength(2);
    for (const [, init] of installed.inquiries()) {
      const payload = JSON.parse(String(init?.body));
      expect(payload.path).toBe("/contact");
      expect(payload).not.toHaveProperty("ref");
      expect(String(init?.body)).not.toMatch(/secret|private=1|details/);
    }
    await vi.advanceTimersByTimeAsync(2000);
    const analytics = installed.request.mock.calls.find(([url]) => url.endsWith("/events"));
    expect(JSON.parse(String(analytics?.[1]?.body)).events[0].ref).toBe("https://source.example/");
  });

  it("waits for consent, stops both forms and tracking after revocation, then resumes", async () => {
    const installed = await install(true);
    expect(installed.request).not.toHaveBeenCalled();
    expect(installed.page.querySelector("[data-strelva-form] form")).toBeNull();
    installed.api.consent(true);
    for (let step = 0; step < 5; step++) await Promise.resolve();
    installed.page.dispatchEvent(new Event("DOMContentLoaded"));
    const mounted = fillMounted(installed.page);
    installed.request.mockClear();
    installed.api.consent(false);
    mounted.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    installed.page.querySelector("#existing")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    installed.api.track("call_click", "tel:5551234567");
    await vi.advanceTimersByTimeAsync(2000);
    expect(installed.request).not.toHaveBeenCalled();
    expect(mounted.textContent).toContain("Allow Strelva to send this form");
    expect(mounted.querySelector("button")!.disabled).toBe(false);
    installed.api.consent(true);
    mounted.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(installed.inquiries()).toHaveLength(1);
  });
});
