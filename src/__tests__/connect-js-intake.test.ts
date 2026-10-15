// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Loads the real public/connect.js into a fresh jsdom window, with fetch stubbed at the network edge. */
const SOURCE = readFileSync(path.resolve(__dirname, "../../public/connect.js"), "utf8");
const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const API = `https://app.strelva.test/api/v1/connect/${KEY}`;

const FORM = {
  schemaVersion: 1, appId: "dental_intake", release: 1, title: "Request a visit", intro: "Tell us a little about you.", notice: "Please don't include medical details.", submitLabel: "Send",
  fields: [
    { id: "name", kind: "text", label: "Your name", required: true, maxLength: 200, sensitive: false, autocomplete: "name" },
    { id: "phone", kind: "phone", label: "Phone", required: true, maxLength: 200, sensitive: false, autocomplete: "tel" },
    { id: "email", kind: "email", label: "Email", required: false, maxLength: 200, sensitive: false, hint: "Optional." },
    { id: "patient_status", kind: "choice", label: "Have you been here before?", required: true, maxLength: 200, sensitive: false, options: [{ value: "new", label: "No" }, { value: "returning", label: "Yes" }] },
    { id: "reason", kind: "choice", label: "What is the visit for?", required: true, maxLength: 200, sensitive: false, options: [
      { value: "checkup", label: "Checkup" }, { value: "exam", label: "Exam" }, { value: "child", label: "Child" }, { value: "urgent", label: "Tooth pain" }] },
    { id: "insurance_carrier", kind: "choice", label: "Dental insurance", required: true, maxLength: 200, sensitive: false, options: [{ value: "p_cigna", label: "Cigna" }, { value: "none", label: "No insurance" }, { value: "other", label: "Other" }] },
    { id: "insurance_member_id", kind: "text", label: "Member ID (optional)", required: false, maxLength: 40, sensitive: true, shownWhen: { field: "insurance_carrier", notIn: ["none"] } },
    { id: "preferred_days", kind: "multi_choice", label: "Which days work?", required: false, maxLength: 200, sensitive: false, options: [{ value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "thu", label: "Thu" }] },
    { id: "note", kind: "textarea", label: "Anything else?", required: false, maxLength: 500, sensitive: false },
  ],
  triage: [{ field: "reason", anyOf: ["urgent"], title: "Tooth pain?", body: "Call the office now.", emergencyNote: "If you can't breathe, call 911.", afterSubmit: "Or send this form." }],
  office: { name: "North Dental", phone: "(716) 555-0100", openNow: true, todayHours: "8:00 AM–5:00 PM" },
  thanks: { routine: "Thanks. The office will call you.", urgent: "Thanks. If you're in pain now, please call." },
};

interface Loaded {
  win: Window & typeof globalThis & { strelva: { consent(v: boolean): void } };
  fetch: ReturnType<typeof vi.fn>;
  beacon: ReturnType<typeof vi.fn>;
  close(): void;
}
let current: Loaded | null = null;

function load(body: string, options: { attrs?: string; form?: unknown; formStatus?: number; submit?: { status: number; body: unknown } } = {}): Loaded {
  const JSDOM = (globalThis as unknown as { jsdom: { constructor: new (html: string, opts: object) => { window: Loaded["win"] } } }).jsdom.constructor;
  const dom = new JSDOM(
    `<!doctype html><html><head><script src="https://app.strelva.test/connect.js" data-strelva-site="${KEY}" ${options.attrs ?? ""}></script></head><body>${body}</body></html>`,
    { url: "https://north.example/visit", runScripts: "outside-only" },
  );
  const win = dom.window;
  const submit = options.submit ?? { status: 201, body: { ok: true, id: "s1", triage: "routine" } };
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/context")) return { ok: true, status: 200, json: async () => ({ revision: 1, facts: {}, site: { captureForms: true, injectSchema: false } }) };
    if (url === `${API}/apps/dental_intake`) return { ok: (options.formStatus ?? 200) < 400, status: options.formStatus ?? 200, json: async () => options.form ?? FORM };
    if (url.endsWith("/intake")) return { ok: submit.status < 400, status: submit.status, json: async () => submit.body };
    return { ok: true, status: 201, json: async () => ({ ok: true }) };
  });
  const beacon = vi.fn(() => true);
  Object.defineProperty(win, "fetch", { value: fetch, configurable: true, writable: true });
  Object.defineProperty(win.navigator, "sendBeacon", { value: beacon, configurable: true });
  win.document.addEventListener("click", (e) => e.preventDefault());
  win.eval(SOURCE);
  current = { win, fetch, beacon, close: () => win.close() };
  return current;
}

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
afterEach(() => { current?.close(); current = null; });

const host = (page: Loaded) => page.win.document.querySelector<HTMLElement>("[data-strelva-app]")!;
const q = <T extends Element = HTMLElement>(page: Loaded, selector: string) => host(page).querySelector<T>(selector)!;
function type(page: Loaded, name: string, value: string) {
  const el = q<HTMLInputElement>(page, `[name$="${name}"]`);
  el.value = value;
  el.dispatchEvent(new page.win.Event("change", { bubbles: true }));
}
function pick(page: Loaded, name: string, value: string) {
  const el = host(page).querySelector<HTMLInputElement>(`input[name$="${name}"][value="${value}"]`)!;
  el.checked = true;
  el.dispatchEvent(new page.win.Event("change", { bubbles: true }));
}
function choose(page: Loaded, name: string, value: string) {
  const el = q<HTMLSelectElement>(page, `select[name="${name}"]`);
  el.value = value;
  el.dispatchEvent(new page.win.Event("change", { bubbles: true }));
}
const sendForm = (page: Loaded) => q<HTMLFormElement>(page, "form").dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true }));
const intakePosts = (page: Loaded) => page.fetch.mock.calls.filter((call: unknown[]) => call[0] === `${API}/apps/dental_intake/intake`).map((call: unknown[]) => JSON.parse((call[1] as { body: string; headers: Record<string, string> }).body) as Record<string, unknown>);

function fillRoutine(page: Loaded) {
  type(page, "name", "Pat Lee"); type(page, "phone", "716 555 0111");
  pick(page, "patient_status", "new"); choose(page, "reason", "checkup"); pick(page, "insurance_carrier", "p_cigna");
}

describe("connect.js Strelva App forms", () => {
  it("renders the fields, radios and checkboxes, marking required ones", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>');
    await tick();
    expect(q(page, "h3").textContent).toBe("Request a visit");
    expect(host(page).querySelectorAll('input[type="radio"]').length).toBe(5);
    expect(host(page).querySelectorAll('input[type="checkbox"]').length).toBe(3);
    expect(host(page).querySelectorAll("select").length).toBe(1);
    expect(host(page).querySelector("label")!.textContent).toBe("Your name (required)");
    expect(host(page).querySelector("legend")!.textContent).toBe("Have you been here before? (required)");
    expect(host(page).querySelector('input[name$="email"]')!.getAttribute("aria-describedby")).toMatch(/-hint$/);
    expect(page.fetch).toHaveBeenCalledWith(`${API}/apps/dental_intake`, { credentials: "omit" });
  });

  it("hides the member ID when insurance is No insurance and skips it on send", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>');
    await tick();
    const row = () => q(page, '[name$="insurance_member_id"]').parentElement as HTMLElement;
    expect(row().hidden).toBe(false);
    pick(page, "insurance_carrier", "none");
    expect(row().hidden).toBe(true);
    q<HTMLInputElement>(page, '[name$="insurance_member_id"]').value = "ABC";
    type(page, "name", "Pat Lee"); type(page, "phone", "716 555 0111"); pick(page, "patient_status", "new"); choose(page, "reason", "checkup");
    sendForm(page);
    await tick();
    expect(intakePosts(page)[0]!.answers).not.toHaveProperty("insurance_member_id");
  });

  it("reveals the call-now path for tooth pain with a tel link, the 911 note and focus", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>');
    await tick();
    const panel = q(page, '[aria-label="Urgent care"]');
    expect(panel.hidden).toBe(true);
    choose(page, "reason", "urgent");
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector<HTMLAnchorElement>("a")!.getAttribute("href")).toBe("tel:7165550100");
    expect(panel.querySelector("a")!.textContent).toBe("Call the office: (716) 555-0100");
    expect(panel.textContent).toContain("call 911");
    expect(panel.textContent).not.toContain("closed now");
    expect(page.win.document.activeElement?.tagName).toBe("H4");
    choose(page, "reason", "checkup");
    expect(panel.hidden).toBe(true);
  });

  it("says when the office is closed", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>', { form: { ...FORM, office: { ...FORM.office, openNow: false } } });
    await tick();
    choose(page, "reason", "urgent");
    expect(q(page, '[aria-label="Urgent care"]').textContent).toContain("The office is closed now. Calling plays their after-hours instructions.");
  });

  it("blocks a submit missing a required answer, with a correction", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>');
    await tick();
    type(page, "name", "Pat Lee");
    sendForm(page);
    expect(q(page, '[role="status"]').textContent).toBe("Please answer: Phone.");
    expect(q(page, '[name$="phone"]').getAttribute("aria-invalid")).toBe("true");
    expect(intakePosts(page)).toHaveLength(0);
    type(page, "phone", "12");
    sendForm(page);
    expect(q(page, '[role="status"]').textContent).toBe("Enter a valid phone number.");
    type(page, "phone", "716 555 0111"); type(page, "email", "nope");
    sendForm(page);
    expect(q(page, '[role="status"]').textContent).toBe("Enter a valid email address, or clear it and use your phone number.");
  });

  it("posts text/plain with multi choice joined, never beacons the answers, then thanks", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>');
    await tick();
    fillRoutine(page);
    pick(page, "preferred_days", "tue"); pick(page, "preferred_days", "thu");
    sendForm(page);
    await tick();
    const [call] = page.fetch.mock.calls.filter((c: unknown[]) => c[0] === `${API}/apps/dental_intake/intake`);
    expect((call![1] as { headers: Record<string, string> }).headers["Content-Type"]).toBe("text/plain");
    expect(intakePosts(page)[0]).toMatchObject({ answers: { name: "Pat Lee", phone: "716 555 0111", patient_status: "new", reason: "checkup", insurance_carrier: "p_cigna", preferred_days: "tue,thu" }, path: "/visit" });
    expect(q(page, "form").textContent).toBe("Thanks. The office will call you.");
    for (const beacon of page.beacon.mock.calls) expect(String(beacon[1])).not.toContain("Pat Lee");
    for (const fetchCall of page.fetch.mock.calls.filter((c: unknown[]) => String(c[0]).endsWith("/events"))) expect(String((fetchCall[1] as { body: string }).body)).not.toContain("Pat Lee");
  });

  it("shows the urgent thanks with a tel link when the server says urgent", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>', { submit: { status: 201, body: { ok: true, id: "s1", triage: "urgent" } } });
    await tick();
    fillRoutine(page); choose(page, "reason", "urgent");
    sendForm(page);
    await tick();
    expect(q(page, "form").textContent).toContain("Thanks. If you're in pain now, please call.");
    expect(q<HTMLAnchorElement>(page, "form a").getAttribute("href")).toBe("tel:7165550100");
  });

  it("shows a short server message on a 400 and a call-the-office line on other failures", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>', { submit: { status: 400, body: { error: "Please answer: What is the visit for?." } } });
    await tick();
    fillRoutine(page); sendForm(page);
    await tick();
    expect(q(page, '[role="status"]').textContent).toBe("Please answer: What is the visit for?.");
    const broken = load('<div data-strelva-app="dental_intake"></div>', { submit: { status: 500, body: {} } });
    await tick();
    fillRoutine(broken); sendForm(broken);
    await tick();
    expect(broken.win.document.querySelector('[role="status"]')!.textContent).toContain("That didn't send. Please call the office.");
    expect(broken.win.document.querySelector('[role="status"] a')!.getAttribute("href")).toBe("tel:7165550100");
  });

  it("mounts nothing and fetches nothing until consent when the site asks for it", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>', { attrs: 'data-strelva-consent="required"' });
    await tick();
    expect(host(page).children.length).toBe(0);
    expect(page.fetch.mock.calls.filter((c: unknown[]) => String(c[0]).includes("/apps/"))).toHaveLength(0);
    page.win.strelva.consent(true);
    await tick();
    fillRoutine(page); sendForm(page);
    await tick();
    expect(intakePosts(page)).toHaveLength(1);
  });

  it("shows the fallback text when the form is not available", async () => {
    const page = load('<div data-strelva-app="dental_intake"></div>', { formStatus: 404 });
    await tick();
    expect(host(page).textContent).toBe("This form isn't available right now. Please call or email the office.");
  });

  it("leaves a code site's own component and bad ids alone, and does not mount twice", async () => {
    const page = load('<section data-strelva-app="dental_intake" data-strelva-site="' + KEY + '"></section><div data-strelva-app="Bad Id"></div><div data-strelva-app="dental_intake"></div>');
    await tick();
    expect(page.fetch.mock.calls.filter((c: unknown[]) => c[0] === `${API}/apps/dental_intake`)).toHaveLength(1);
    expect(page.win.document.querySelector("section")!.children.length).toBe(0);
  });
});
