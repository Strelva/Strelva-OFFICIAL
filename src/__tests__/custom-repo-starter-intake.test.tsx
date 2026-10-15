// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicIntakeForm, loadIntakeForm, submitIntake, type PublicIntakeForm } from "../../custom-repo-starter/intake-client";
import { StrelvaIntake } from "../../custom-repo-starter/StrelvaIntake";

const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const BASE = "https://app.strelva.test";
const FORM: PublicIntakeForm = {
  schemaVersion: 1, appId: "dental_intake", release: 1, title: "Request a visit", intro: "Tell us a little about you.", notice: "Please don't include medical details.", submitLabel: "Send",
  fields: [
    { id: "name", kind: "text", label: "Your name", required: true, maxLength: 200, sensitive: false, autocomplete: "name" },
    { id: "phone", kind: "phone", label: "Phone", required: true, maxLength: 200, sensitive: false },
    { id: "reason", kind: "choice", label: "What is the visit for?", required: true, maxLength: 200, sensitive: false, options: [
      { value: "checkup", label: "Checkup" }, { value: "exam", label: "Exam" }, { value: "child", label: "Child" }, { value: "urgent", label: "Tooth pain" }] },
    { id: "carrier", kind: "choice", label: "Insurance", required: true, maxLength: 200, sensitive: false, options: [{ value: "p_cigna", label: "Cigna" }, { value: "none", label: "No insurance" }] },
    { id: "member", kind: "text", label: "Member ID", required: false, maxLength: 40, sensitive: true, shownWhen: { field: "carrier", notIn: ["none"] } },
  ],
  triage: [{ field: "reason", anyOf: ["urgent"], title: "Tooth pain?", body: "Call the office now.", emergencyNote: "If you can't breathe, call 911.", afterSubmit: "Or send this form." }],
  office: { name: "North Dental", phone: "(716) 555-0100", openNow: true, todayHours: null },
  thanks: { routine: "Thanks. The office will call you.", urgent: "Thanks. If you're in pain now, please call." },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("isPublicIntakeForm", () => {
  it("accepts the fixture and the real definition's output shape", () => {
    expect(isPublicIntakeForm(FORM)).toBe(true);
  });

  it("rejects 21 fields, a bad kind, a duplicate id and a triage rule on an unknown field", () => {
    const many = { ...FORM, fields: Array.from({ length: 21 }, (_, i) => ({ ...FORM.fields[0]!, id: `f${i}` })) };
    expect(isPublicIntakeForm(many)).toBe(false);
    expect(isPublicIntakeForm({ ...FORM, fields: [{ ...FORM.fields[0]!, kind: "html" }] })).toBe(false);
    expect(isPublicIntakeForm({ ...FORM, fields: [FORM.fields[0]!, FORM.fields[0]!] })).toBe(false);
    expect(isPublicIntakeForm({ ...FORM, triage: [{ ...FORM.triage[0]!, field: "ghost" }] })).toBe(false);
    expect(isPublicIntakeForm({ ...FORM, schemaVersion: 2 })).toBe(false);
    expect(isPublicIntakeForm(null)).toBe(false);
  });
});

describe("intake client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a bad site key or App before any request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(loadIntakeForm(BASE, "nope", "dental_intake")).rejects.toThrow("Invalid site key.");
    await expect(loadIntakeForm(BASE, KEY, "../x")).rejects.toThrow("Invalid App.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads from the connect door without credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(FORM));
    vi.stubGlobal("fetch", fetcher);
    expect(await loadIntakeForm(`${BASE}/`, KEY, "dental_intake")).toEqual(FORM);
    expect(fetcher).toHaveBeenCalledWith(`${BASE}/api/v1/connect/${KEY}/apps/dental_intake`, expect.objectContaining({ credentials: "omit", cache: "no-store" }));
  });

  it("posts text/plain to /intake and reads the triage", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ok: true, id: "s1", triage: "urgent" }, 201));
    vi.stubGlobal("fetch", fetcher);
    expect(await submitIntake(BASE, KEY, "dental_intake", { name: "Pat" })).toEqual({ ok: true, triage: "urgent" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/connect/${KEY}/apps/dental_intake/intake`);
    expect(init.headers).toEqual({ "Content-Type": "text/plain" });
    expect(JSON.parse(init.body)).toMatchObject({ answers: { name: "Pat" }, _hp: "" });
    expect(JSON.parse(init.body).id).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });

  it("shows a short server message on 400 and plain lines otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: "Please answer: Phone." }, 400)).mockResolvedValueOnce(json({}, 409)).mockResolvedValueOnce(json({}, 500)));
    await expect(submitIntake(BASE, KEY, "dental_intake", {})).rejects.toThrow("Please answer: Phone.");
    await expect(submitIntake(BASE, KEY, "dental_intake", {})).rejects.toThrow("This form isn't available right now. Please call the office.");
    await expect(submitIntake(BASE, KEY, "dental_intake", {})).rejects.toThrow("That didn't send. Please call the office.");
  });
});

describe("StrelvaIntake", () => {
  it("renders on the server with the markers the live check looks for", () => {
    const html = renderToString(createElement(StrelvaIntake, { baseUrl: BASE, siteKey: KEY, appId: "dental_intake" }));
    expect(html).toContain('data-strelva-app="dental_intake"');
    expect(html).toContain(`data-strelva-site="${KEY}"`);
  });

  describe("in the browser", () => {
    const roots: ReturnType<typeof createRoot>[] = [];
    beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
    afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
    async function mount(fetcher: typeof fetch) {
      vi.stubGlobal("fetch", fetcher);
      const node = document.createElement("div"); document.body.appendChild(node);
      const root = createRoot(node); roots.push(root);
      await act(async () => { root.render(createElement(StrelvaIntake, { baseUrl: BASE, siteKey: KEY, appId: "dental_intake" })); });
      await act(async () => { await Promise.resolve(); });
      return node;
    }
    const set = async (el: HTMLInputElement | HTMLSelectElement, value: string) => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
    };
    const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };

    it("renders the fields after loading and says so plainly when the form is unavailable", async () => {
      const node = await mount(vi.fn().mockResolvedValue(json(FORM)) as unknown as typeof fetch);
      expect(node.querySelector("h2")!.textContent).toBe("Request a visit");
      expect(node.querySelector("label")!.textContent).toBe("Your name (required)");
      expect(node.querySelectorAll('input[type="radio"]')).toHaveLength(2);
      const gone = await mount(vi.fn().mockResolvedValue(json({}, 404)) as unknown as typeof fetch);
      expect(gone.querySelector('[role="alert"]')!.textContent).toBe("This form isn't available right now. Please call or email the office.");
    });

    it("hides the member ID for No insurance and shows the call-now path for tooth pain", async () => {
      const node = await mount(vi.fn().mockResolvedValue(json(FORM)) as unknown as typeof fetch);
      expect(node.textContent).toContain("Member ID");
      expect(node.querySelector('[aria-label="Urgent care"]')).toBeNull();
      await set(node.querySelector("select")!, "urgent");
      const panel = node.querySelector('[aria-label="Urgent care"]')!;
      expect(panel.querySelector("a")!.getAttribute("href")).toBe("tel:7165550100");
      expect(panel.textContent).toContain("call 911");
      await click(node.querySelector('input[type="radio"][value="none"]')!);
      expect(node.textContent).not.toContain("Member ID");
    });

    it("posts the answers and thanks the patient", async () => {
      const fetcher = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => String(url).endsWith("/intake") ? json({ ok: true, id: "s1", triage: "routine" }, 201) : json(FORM));
      const node = await mount(fetcher as unknown as typeof fetch);
      await set(node.querySelector('input[name="name"], input[id$="-name"]')!, "Pat Lee");
      await set(node.querySelector('input[type="tel"]')!, "716 555 0111");
      await set(node.querySelector("select")!, "checkup");
      await click(node.querySelector('input[type="radio"][value="p_cigna"]')!);
      await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      await act(async () => { await Promise.resolve(); });
      const post = fetcher.mock.calls.find(call => String(call[0]).endsWith("/intake"))!;
      expect(JSON.parse((post[1] as RequestInit).body as string).answers).toMatchObject({ name: "Pat Lee", phone: "716 555 0111", reason: "checkup", carrier: "p_cigna" });
      expect(((post[1] as RequestInit).headers as Record<string, string>)["Content-Type"]).toBe("text/plain");
      expect(node.querySelector('[role="status"]')!.textContent).toBe("Thanks. The office will call you.");
    });

    it("blocks a send with a missing required answer", async () => {
      const fetcher = vi.fn(async () => json(FORM));
      const node = await mount(fetcher as unknown as typeof fetch);
      await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      expect(node.querySelector('[role="alert"]')!.textContent).toBe("Please answer: Your name.");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  it("imports nothing from Strelva and no packages beyond react", () => {
    for (const file of ["StrelvaIntake.tsx", "intake-client.ts"]) {
      const source = readFileSync(path.resolve(__dirname, "../../custom-repo-starter", file), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]!);
      for (const specifier of imports) expect(["react", "./intake-client"], `${file}: ${specifier}`).toContain(specifier);
    }
  });
});
