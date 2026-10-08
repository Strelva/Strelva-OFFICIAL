// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Loads the real public/connect.js into a fresh jsdom window per test, the way
 * a business's site would, with fetch and sendBeacon stubbed at the network edge.
 */
const SOURCE = readFileSync(path.resolve(__dirname, "../../public/connect.js"), "utf8");
const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const API = `https://app.strelva.test/api/v1/connect/${KEY}`;

interface Loaded {
  win: Window & typeof globalThis & { strelva: { consent(v: boolean): void; track(k: string, t?: string): void; facts: Record<string, unknown> } };
  fetch: ReturnType<typeof vi.fn>;
  beacon: ReturnType<typeof vi.fn>;
  close(): void;
}

let current: Loaded | null = null;

const DEFAULT_CONTEXT = {
  revision: 3,
  facts: { name: "Mooney Law", phone: "+1 716 555 0100", hours: [{ day: "mon", opens: "09:00", closes: "17:00" }, { day: "sun", closed: true }] },
  jsonLd: { "@context": "https://schema.org", "@type": "LocalBusiness", name: "Mooney Law" },
  site: { captureForms: true, injectSchema: true },
};

function load(body: string, options: { attrs?: string; head?: string; context?: unknown; url?: string } = {}): Loaded {
  const JSDOM = (globalThis as unknown as { jsdom: { constructor: new (html: string, opts: object) => { window: Loaded["win"] } } }).jsdom.constructor;
  const dom = new JSDOM(
    `<!doctype html><html><head>${options.head ?? ""}<script src="https://app.strelva.test/connect.js" data-strelva-site="${KEY}" ${options.attrs ?? ""}></script></head><body>${body}</body></html>`,
    { url: options.url ?? "https://attymooney.com/contact?email=pat@x.com#top", referrer: "https://www.google.com/search?q=closing+lawyer", runScripts: "outside-only" },
  );
  const win = dom.window;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/context")) return { ok: true, status: 200, json: async () => options.context ?? DEFAULT_CONTEXT };
    return { ok: true, status: 201, json: async () => ({ ok: true, id: "inq-1" }) };
  });
  const beacon = vi.fn(() => true);
  Object.defineProperty(win, "fetch", { value: fetch, configurable: true, writable: true });
  Object.defineProperty(win.navigator, "sendBeacon", { value: beacon, configurable: true });
  // jsdom does not navigate; keep link and form defaults from logging noise.
  win.document.addEventListener("click", (e) => e.preventDefault());
  win.eval(SOURCE);
  current = { win, fetch, beacon, close: () => win.close() };
  return current;
}

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

function beaconEvents(loaded: Loaded): Array<Record<string, string>> {
  return loaded.beacon.mock.calls.flatMap((call: unknown[]) => {
    expect(call[0]).toBe(`${API}/events`);
    return (JSON.parse(call[1] as string) as { events: Array<Record<string, string>> }).events;
  });
}

function posts(loaded: Loaded, suffix: string): Array<Record<string, unknown>> {
  return loaded.fetch.mock.calls
    .filter((call: unknown[]) => call[0] === `${API}${suffix}`)
    .map((call: unknown[]) => JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>);
}

afterEach(() => {
  current?.close();
  current = null;
});

describe("connect.js", () => {
  it("renders offered native booking times only from signed app links after inquiry confirmation", async () => {
    const page = load('<div data-strelva-form></div>');
    await tick();
    page.fetch.mockImplementation(async (url: string) => url.endsWith("/inquiries") ? { ok: true, status: 201, json: async () => ({ ok: true, bookingOffer: { serviceName: "Consultation", slots: [{ label: "Friday 9 AM", chooseUrl: "/inquiry-booking/encoded.signature?slot=0" }] } }) } : { ok: true, status: 200, json: async () => DEFAULT_CONTEXT });
    const form = page.win.document.querySelector<HTMLFormElement>("[data-strelva-form] form")!;
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Dana";
    form.querySelector<HTMLInputElement>('input[name="email"]')!.value = "dana@example.test";
    form.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    const link = form.querySelector<HTMLAnchorElement>('[aria-label="Appointment times"] a')!;
    expect(link.textContent).toBe("Friday 9 AM");
    expect(link.href).toBe("https://app.strelva.test/inquiry-booking/encoded.signature?slot=0");
    expect(form.textContent).toContain("business must confirm");
    page.fetch.mockImplementation(async () => ({ ok: true, status: 201, json: async () => ({ ok: true, bookingOffer: { serviceName: "Consultation", slots: [{ label: "Bad link", chooseUrl: "https://other.test/path" }] } }) }));
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Dana";
    form.querySelector<HTMLInputElement>('input[name="email"]')!.value = "dana@example.test";
    form.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(form.querySelector('[aria-label="Appointment times"] a')).toBeNull();
    expect(form.textContent).toContain("Thanks. Your message was sent.");
  });

  it("sends a visit with the path but no query string, and only the referrer's origin", async () => {
    const page = load("<main>Hi</main>");
    await tick();
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const [visit] = beaconEvents(page);
    expect(visit).toMatchObject({ kind: "visit", path: "/contact", ref: "https://www.google.com/" });
    expect(visit!.id).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    const raw = page.beacon.mock.calls[0]![1] as string;
    expect(raw).not.toContain("pat@x.com");
    expect(raw).not.toContain("closing+lawyer");
    expect(JSON.parse(raw).sid).toMatch(/^[a-z0-9]{16,}$/);
  });

  it("counts a new visit on SPA navigation and skips the same path", async () => {
    const page = load("");
    page.win.history.pushState({}, "", "/about");
    page.win.history.replaceState({}, "", "/about");
    await tick();
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    expect(beaconEvents(page).map((e) => e.path)).toEqual(["/contact", "/about"]);
  });

  it("classifies tel, mailto, booking and map clicks", async () => {
    const page = load(`
      <a id="call" href="tel:+17165550100"><span>Call us</span></a>
      <a id="mail" href="mailto:hello@mooney.example?subject=Hi">Email</a>
      <a id="book" href="https://calendly.com/mooney/consult?utm=x">Book</a>
      <a id="map" href="https://www.google.com/maps/place/Mooney+Law">Directions</a>
      <a id="fb" href="https://facebook.com/mooneylaw">Facebook</a>`);
    for (const id of ["call", "mail", "book", "map", "fb"]) {
      const target = id === "call" ? page.win.document.querySelector("#call span")! : page.win.document.getElementById(id)!;
      (target as HTMLElement).click();
    }
    page.win.document.dispatchEvent(new page.win.Event("visibilitychange"));
    Object.defineProperty(page.win.document, "visibilityState", { value: "hidden", configurable: true });
    page.win.document.dispatchEvent(new page.win.Event("visibilitychange"));
    const clicks = beaconEvents(page).filter((e) => e.kind !== "visit");
    expect(clicks.map((e) => [e.kind, e.target])).toEqual([
      ["call_click", "tel:+17165550100"],
      ["email_click", "mailto:hello@mooney.example"],
      ["booking_click", "https://calendly.com/mooney/consult"],
      ["directions_click", "https://www.google.com/maps/place/Mooney+Law"],
    ]);
  });

  it("posts the site's own contact form as a site-form inquiry without sensitive fields or blocking the submit", async () => {
    const page = load(`
      <form id="contact" action="/thanks">
        <input name="your-name" value="Pat Rivera">
        <input type="email" name="your-email" value="pat@example.com">
        <textarea name="message">Closing next month?</textarea>
        <input type="password" name="password" value="hunter2">
        <input name="card_number" value="4242424242424242">
        <input name="cvv" value="123">
        <input type="hidden" name="_token" value="csrf-secret">
        <input type="file" name="upload">
        <input type="checkbox" name="newsletter" value="yes">
        <button type="submit">Send</button>
      </form>
      <form id="search"><input name="q" value="wills"></form>
      <form id="ignored" data-strelva-ignore><input type="email" name="email" value="x@example.com"></form>`);
    await tick();
    let prevented: boolean | null = null;
    page.win.document.addEventListener("submit", (e) => { prevented = e.defaultPrevented; e.preventDefault(); });
    for (const id of ["contact", "search", "ignored"]) (page.win.document.getElementById(id) as HTMLFormElement).requestSubmit();
    expect(prevented).toBe(false);
    const sent = posts(page, "/inquiries");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      capture: "site-form",
      path: "/contact",
      fields: { "your-name": "Pat Rivera", "your-email": "pat@example.com", message: "Closing next month?" },
    });
    const raw = JSON.stringify(sent[0]);
    for (const secret of ["hunter2", "4242", "123\"", "csrf-secret", "newsletter"]) expect(raw).not.toContain(secret);
  });

  it("leaves site forms alone when capture is off", async () => {
    const page = load(`<form id="c"><input type="email" name="email" value="pat@example.com"></form>`, { attrs: 'data-strelva-capture="off"' });
    await tick();
    page.win.document.addEventListener("submit", (e) => e.preventDefault());
    (page.win.document.getElementById("c") as HTMLFormElement).requestSubmit();
    expect(posts(page, "/inquiries")).toHaveLength(0);
  });

  it("mounts an accessible Strelva form and sends it as strelva-form", async () => {
    const page = load(`<div id="slot" data-strelva-form></div>`);
    await tick(); // mounts on DOMContentLoaded when the script runs early
    const doc = page.win.document;
    const form = doc.querySelector("#slot form") as HTMLFormElement;
    expect(form).not.toBeNull();
    for (const name of ["name", "email", "phone", "message"]) {
      const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
      expect(doc.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
    expect(form.querySelector('[name="_hp"]')?.closest("[aria-hidden=true]")).not.toBeNull();
    const status = form.querySelector("[role=status]")!;
    expect(status.getAttribute("aria-live")).toBe("polite");

    form.requestSubmit();
    expect(status.textContent).toMatch(/email or phone/);
    (form.querySelector('[name="email"]') as HTMLInputElement).value = "pat@example.com";
    (form.querySelector('[name="message"]') as HTMLTextAreaElement).value = "Do you do wills?";
    form.requestSubmit();
    await tick();
    const [sent] = posts(page, "/inquiries");
    expect(sent).toMatchObject({ capture: "strelva-form", _hp: "", fields: { email: "pat@example.com", message: "Do you do wills?" } });
    expect(status.textContent).toBe("Thanks. Your message was sent.");
  });

  it("fills facts as text, exposes them, and injects JSON-LD only when the page has none", async () => {
    const page = load(`<a data-strelva-fact="phone"></a><p data-strelva-fact="hours"></p><b data-strelva-fact="email">keep</b>`);
    await tick();
    const doc = page.win.document;
    expect(doc.querySelector("[data-strelva-fact=phone]")!.textContent).toBe("+1 716 555 0100");
    expect(doc.querySelector("[data-strelva-fact=phone]")!.getAttribute("href")).toBe("tel:+17165550100");
    expect(doc.querySelector("[data-strelva-fact=hours]")!.innerHTML).toBe("Mon 9 AM – 5 PM<br>Sun Closed");
    expect(doc.querySelector("[data-strelva-fact=email]")!.textContent).toBe("keep");
    expect(page.win.strelva.facts).toMatchObject({ name: "Mooney Law" });
    expect(JSON.parse(doc.querySelector("script[data-strelva]")!.textContent!)).toMatchObject({ name: "Mooney Law" });

    page.close();
    const own = load("", { head: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LegalService","name":"Mooney"}</script>` });
    await tick();
    expect(own.win.document.querySelector("script[data-strelva]")).toBeNull();
  });

  it("reports only schema presence without exposing client-supplied business fields", async () => {
    const ld = { "@context": "https://schema.org", "@graph": [
      { "@type": "WebSite", name: "Unrelated page" },
      { "@type": ["Organization", "LocalBusiness"], name: "Old Mooney", telephone: "716-555-0199",
        address: { "@type": "PostalAddress", streetAddress: "1 Main St", addressLocality: "Buffalo", addressRegion: "NY", postalCode: "14201", addressCountry: { "@type": "Country", name: "US" } },
        openingHoursSpecification: { dayOfWeek: ["Monday", "Tuesday"], opens: "08:00", closes: "16:00" },
        openingHours: "Mo-Fr 08:00-16:00", email: "not-reported@example.test", description: "Not reported" },
    ] };
    const original = JSON.stringify(ld);
    const page = load("", { head: `<script type="application/ld+json">${original}</script>` });
    await tick();
    expect(posts(page, "/events")).toEqual([{ events: [], platformSchema: { present: true } }]);
    expect(page.win.document.querySelector('script[type="application/ld+json"]')!.textContent).toBe(original);
    expect(page.win.document.querySelector("script[data-strelva]")).toBeNull();
    expect(JSON.stringify(posts(page, "/events"))).not.toContain("Old Mooney");
  });

  it("reports presence for malformed platform schema and leaves injection off untouched", async () => {
    const page = load("", { head: '<script type="application/ld+json">{"@type":"LocalBusiness", invalid}</script>' });
    await tick();
    expect(posts(page, "/events")).toEqual([{ events: [], platformSchema: { present: true } }]);
    expect(page.win.document.querySelector("script[data-strelva]")).toBeNull();
    page.close();
    const off = load("", { head: '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Old"}</script>', context: { ...DEFAULT_CONTEXT, site: { captureForms: true, injectSchema: false } } });
    await tick();
    expect(posts(off, "/events")).toEqual([]);
  });

  it("reports an existing platform schema even when there are no confirmed facts to inject", async () => {
    const context = { ...DEFAULT_CONTEXT, jsonLd: null };
    const page = load("", { head: '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Existing"}</script>', context });
    await tick();
    expect(posts(page, "/events")).toEqual([{ events: [], platformSchema: { present: true } }]);
  });

  it("sends nothing until consent when consent is required", async () => {
    const page = load(`<div data-strelva-form></div><a id="call" href="tel:+17165550100">Call</a>`, { attrs: 'data-strelva-consent="required"' });
    await tick();
    page.win.document.getElementById("call")!.click();
    page.win.strelva.track("call_click", "tel:+1");
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    expect(page.fetch).not.toHaveBeenCalled();
    expect(page.beacon).not.toHaveBeenCalled();

    page.win.strelva.consent(true);
    await tick();
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    expect(page.fetch).toHaveBeenCalledWith(`${API}/context`, expect.anything());
    expect(beaconEvents(page).map((e) => e.kind)).toEqual(["visit"]);
  });

  it("is safe to load twice", async () => {
    const page = load("");
    page.win.eval(SOURCE);
    await tick();
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    expect(beaconEvents(page)).toHaveLength(1);
    expect(page.fetch.mock.calls.filter((c: unknown[]) => String(c[0]).endsWith("/context"))).toHaveLength(1);
  });
});
