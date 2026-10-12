// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GettingStarted, type GettingStartedLinks } from "@/experience/getting-started/GettingStarted";
import { StartBusinessFromCheck } from "@/experience/getting-started/StartBusinessFromCheck";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { heldBriefKey, type FoundFact } from "@/products/getting-started/contracts";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...rest }, children) }));

const BUSINESS = "5a000000-0000-4000-8000-0000000000b1";
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); sessionStorage.clear(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type Transport = (input: string, init?: RequestInit) => Promise<Response>;
async function mount(node: React.ReactElement, transport: Transport) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(createElement(WorkspaceRequestContext.Provider, { value: transport as typeof fetch }, node)); });
}
const button = (text: string) => [...container.querySelectorAll("button")].find(item => item.textContent?.includes(text));

const links: GettingStartedLinks = { home: `/workspace?workspaceId=${BUSINESS}`, details: `/workspace/business-details?workspaceId=${BUSINESS}`, agency: `/workspace?workspaceId=${BUSINESS}&view=help`, google: `/workspace/google?workspaceId=${BUSINESS}`, connect: null, request: null };
const found: FoundFact[] = [
  { id: "phone:1", key: "phone", label: "Phone", display: "(716) 555-0100", value: "(716) 555-0100", source: { url: "https://northside.example/contact", quote: "Call (716) 555-0100" }, current: null },
  { id: "service:cakes", key: "service", label: "Service", display: "Custom cakes", value: "Custom cakes", source: { url: "https://northside.example/", quote: "Custom cakes" }, current: null },
];

describe("Start with this fix (owner door)", () => {
  it("prefills the business from the check, starts it once, and lands on Getting started", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const transport = vi.fn(async (input: string, init?: RequestInit) => {
      if (!init?.method) return json({ check: { name: "Northside Bakery", suggestedName: "Northside Bakery", website: "https://northside.example/", kind: "ai_visibility" } });
      return json({ workspaceId: BUSINESS, location: `/workspace/getting-started?workspaceId=${BUSINESS}` }, 201);
    });
    await mount(createElement(StartBusinessFromCheck, { resultId: "scan_abc", workspaceName: "Personal", savingHere: false, saveHereError: "", onSaveHere: vi.fn(), onClose: vi.fn() }), transport);
    expect(container.querySelector("[role=dialog]")?.getAttribute("aria-labelledby")).toBe("start-business-title");
    const name = container.querySelector<HTMLInputElement>("input")!;
    expect(name.value).toBe("Northside Bakery");
    expect(document.activeElement).toBe(name);
    expect(container.textContent).toContain("https://northside.example/");
    expect(container.textContent).toContain("Save to Personal instead");
    const form = container.querySelector("form")!;
    await act(async () => { form.requestSubmit(); form.requestSubmit(); });
    const posts = transport.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]![1]!.body))).toEqual({ action: "start_from_check", resultId: "scan_abc", name: "Northside Bakery" });
    expect(assign).toHaveBeenCalledWith(`/workspace/getting-started?workspaceId=${BUSINESS}`);
  });

  it("keeps saving here available when the check can't be opened", async () => {
    const onSaveHere = vi.fn();
    await mount(createElement(StartBusinessFromCheck, { resultId: "scan_gone", workspaceName: "Personal", savingHere: false, saveHereError: "", onSaveHere, onClose: vi.fn() }), async () => json({ error: "This check has expired or is unavailable. Run another check." }, 404));
    expect(container.querySelector("[role=alert]")?.textContent).toContain("expired");
    await act(async () => button("Save to Personal instead")!.click());
    expect(onSaveHere).toHaveBeenCalled();
  });
});

describe("Getting started", () => {
  it("shows the business, its website, the next steps and an honest closed step", async () => {
    await mount(createElement(GettingStarted, { business: { workspaceId: BUSINESS, name: "Northside Bakery", website: "https://northside.example/", canConfirm: true, revision: 2 }, links }), vi.fn());
    expect(container.querySelector("h1")?.textContent).toBe("Northside Bakery");
    expect(container.textContent).toContain("northside.example");
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')!.value).toBe("https://northside.example/");
    expect(container.querySelector(`a[href="${links.google}"]`)?.textContent).toContain("Connect Google");
    expect([...container.querySelectorAll("a")].find(a => a.getAttribute("href") === links.agency)?.textContent).toContain("Bring in an agency");
    // Keep your site isn't open for this business: no dead link.
    expect(container.textContent).toContain("Keep your site");
    expect(container.textContent).toContain("Not open for your business yet.");
    expect(container.querySelector('a[href*="entry=connect"]')).toBeNull();
  });

  it("shows a held brief back and says it was not sent", async () => {
    sessionStorage.setItem(heldBriefKey(BUSINESS), "Please rebuild our menu page.");
    await mount(createElement(GettingStarted, { business: { workspaceId: BUSINESS, name: "Northside Bakery", website: null, canConfirm: true, revision: 0 }, links }), vi.fn());
    expect(container.textContent).toContain("Your request is waiting");
    expect(container.textContent).toContain("Please rebuild our menu page.");
    expect(container.textContent).toContain("wasn’t sent or saved");
    expect(container.textContent).toContain("No website on your business yet.");
  });

  it("reads the website, shows found facts with sources, and adds only what the owner keeps ticked", async () => {
    const transport = vi.fn(async (_input: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      if (body.action === "read_website") return json({ reading: { url: "https://northside.example/", revision: 2, pagesRead: 2, facts: found } });
      return json({ saved: ["phone"], revision: 3 });
    });
    await mount(createElement(GettingStarted, { business: { workspaceId: BUSINESS, name: "Northside Bakery", website: "https://northside.example/", canConfirm: true, revision: 2 }, links }), transport);
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(container.textContent).toContain("Found on northside.example");
    expect(container.textContent).toContain("“Call (716) 555-0100”");
    expect(container.querySelector('a[href="https://northside.example/contact"]')?.getAttribute("rel")).toBe("noopener noreferrer");
    // Found facts are written only on the owner's click; untick the service first.
    expect(transport.mock.calls.filter(([, init]) => JSON.parse(String(init!.body)).action === "confirm_found_facts")).toHaveLength(0);
    const boxes = [...container.querySelectorAll<HTMLInputElement>('ul[aria-label="Found facts"] input[type="checkbox"]')];
    expect(boxes.map(box => box.checked)).toEqual([true, true]);
    await act(async () => boxes[1]!.click());
    await act(async () => button("Add 1 detail")!.click());
    const confirm = transport.mock.calls.map(([, init]) => JSON.parse(String(init!.body))).find(body => body.action === "confirm_found_facts");
    expect(confirm).toEqual({ action: "confirm_found_facts", workspaceId: BUSINESS, revision: 2, facts: [{ key: "phone", value: "(716) 555-0100" }] });
    expect(container.textContent).toContain("Added to your business.");
  });

  it("does not let a non-owner read or add found facts", async () => {
    await mount(createElement(GettingStarted, { business: { workspaceId: BUSINESS, name: "Northside Bakery", website: null, canConfirm: false, revision: 0 }, links }), vi.fn());
    expect(container.textContent).toContain("Only the business owner can add details found on the website.");
    expect(container.querySelector('input[type="url"]')).toBeNull();
  });
});
