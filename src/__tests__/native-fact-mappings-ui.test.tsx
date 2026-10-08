// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeFactMappings } from "@/experience/places/NativeFactMappings";

const WS = "7f000000-0000-4000-8000-000000000010";
const SERVICE = "7f000000-0000-4000-8000-000000000011";
const OTHER_SERVICE = "7f000000-0000-4000-8000-000000000012";
const mapping = { revision: 3, fields: ["phone", "email", "address", "hours"], services: [] };
const data = { mapping, businessServices: [{ id: SERVICE, name: "Consultation" }, { id: OTHER_SERVICE, name: "Consultation" }], nativeServices: [{ id: "native-two", name: "Consultation" }, { id: "native-one", name: "Consultation" }] };
const sites = [{ tenantId: "lakeshore", siteName: "Lakeshore" }, { tenantId: "harbor", siteName: "Harbor" }];
let root: Root | undefined;
let container: HTMLDivElement;
async function mount(request: typeof fetch, extra: Partial<Parameters<typeof NativeFactMappings>[0]> = {}) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(NativeFactMappings, { workspaceId: WS, sites, request, ...extra })));
}
function button(text: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes(text))!; }
async function select(label: string, value: string) {
  const node = Array.from(container.querySelectorAll("label")).find(item => item.textContent === label)!;
  const element = container.querySelector<HTMLSelectElement>(`[id="${node.htmlFor}"]`)!;
  await act(async () => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); });
}
function checkbox(label: string) { return Array.from(container.querySelectorAll("label")).find(item => item.textContent === label)!.querySelector<HTMLInputElement>("input")!; }
async function check(label: string) { await act(async () => checkbox(label).click()); }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; document.body.innerHTML = ""; });

describe("explicit native website fact configuration", () => {
  it("loads only a selected site and starts with saved contact facts, no assumed name or service matching", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(data));
    await mount(request);
    expect(request).not.toHaveBeenCalled();
    await select("Website to configure", "lakeshore");
    expect(request.mock.calls[0]![0]).toBe(`/api/workspace/business-details/native-mapping?workspaceId=${WS}&tenantId=lakeshore`);
    expect(checkbox("Business name").checked).toBe(false);
    expect(checkbox("Phone").checked).toBe(true);
    expect(container.textContent).toContain("No services are paired");
    await act(async () => button("Pair a service").click());
    const selected = container.querySelectorAll("select");
    expect(selected[1]!.value).toBe(""); expect(selected[2]!.value).toBe("");
    expect(checkbox("Name").checked).toBe(false);
  });

  it("saves the explicitly selected UUID and native ID, field by field, then avoids a duplicate save", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? Response.json({ mapping: { ...JSON.parse(String(init.body)).mapping, revision: 4 } }) : Response.json(data));
    await mount(request); await select("Website to configure", "lakeshore");
    await check("Business name");
    await act(async () => button("Pair a service").click());
    await select("Business service 1", OTHER_SERVICE); await select("Website service 1", "native-one");
    await check("Price"); await check("Duration");
    await submit();
    const write = request.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(write[1]!.body))).toEqual({ workspaceId: WS, tenantId: "lakeshore", revision: 3, mapping: { fields: ["phone", "email", "address", "hours", "display_name"], services: [{ serviceId: OTHER_SERVICE, nativeServiceId: "native-one", fields: ["priceText", "durationMinutes"] }] } });
    expect(container.textContent).toContain("They apply when you next change those facts. Nothing was published.");
    await submit(); expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await check("Phone"); await submit();
    const writes = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(writes[1]![1]!.body)).revision).toBe(4);
  });

  it("only offers business fields supported by this website's sections", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? Response.json({ mapping: { ...JSON.parse(String(init.body)).mapping, revision: 4 } }) : Response.json({ ...data, mapping: { ...mapping, fields: [] }, availableFields: ["display_name"] }));
    await mount(request); await select("Website to configure", "lakeshore");
    expect(checkbox("Business name").checked).toBe(false);
    expect(Array.from(container.querySelectorAll("label")).some(item => item.textContent === "Phone")).toBe(false);
    expect(Array.from(container.querySelectorAll("label")).some(item => item.textContent === "Hours and dated exceptions")).toBe(false);
    await check("Business name"); await submit();
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body)).mapping.fields).toEqual(["display_name"]);
  });

  it("retains inputs and the expected revision when a mapping save conflicts", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? Response.json({ error: "These website settings changed. Reload to compare them." }, { status: 409 }) : Response.json(data));
    await mount(request); await select("Website to configure", "lakeshore"); await check("Business name"); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("settings changed");
    expect(checkbox("Business name").checked).toBe(true);
    expect(container.textContent).not.toContain("Website fact settings saved.");
    await submit();
    for (const [, init] of request.mock.calls.filter(([, init]) => init?.method === "POST")) expect(JSON.parse(String(init!.body)).revision).toBe(3);
  });

  it("validates incomplete or duplicate pairings before sending, without guessing from equal names", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(data));
    await mount(request); await select("Website to configure", "lakeshore");
    await act(async () => button("Pair a service").click()); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("at least one field");
    await select("Business service 1", SERVICE); await select("Website service 1", "native-two"); await check("Name");
    await act(async () => button("Pair a service").click());
    await select("Business service 2", SERVICE); await select("Website service 2", "native-one");
    const names = Array.from(container.querySelectorAll("label")).filter(item => item.textContent === "Name");
    await act(async () => names[1]!.querySelector<HTMLInputElement>("input")!.click()); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Each service can appear only once");
    expect(request).toHaveBeenCalledOnce();
  });

  it("disables controls during saves and guards same-tick duplicate submits", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? new Promise<Response>(resolve => { finish = resolve; }) : Response.json(data));
    await mount(request); await select("Website to configure", "lakeshore"); await check("Business name");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(checkbox("Phone").matches(":disabled")).toBe(true);
    expect(button("Save website").disabled).toBe(true);
    await act(async () => finish(Response.json({ mapping: { ...mapping, revision: 4, fields: [...mapping.fields, "display_name"] } })));
    expect(button("Save website").disabled).toBe(false);
  });

  it("ignores a late read after selecting another website", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("tenantId=lakeshore") ? new Promise<Response>(resolve => { finish = resolve; }) : Response.json({ ...data, mapping: { ...mapping, fields: [] } }));
    await mount(request); await select("Website to configure", "lakeshore");
    expect(container.textContent).toContain("Loading website fact settings");
    await select("Website to configure", "harbor");
    await act(async () => finish(Response.json(data)));
    expect(checkbox("Phone").checked).toBe(false);
    expect(container.querySelector("select")!.value).toBe("harbor");
  });

  it("has explicit unavailable, empty and read-only states without writes", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ error: "This website is unavailable." }, { status: 403 })).mockResolvedValueOnce(Response.json({ ...data, businessServices: [], nativeServices: [] }));
    await mount(request); await select("Website to configure", "lakeshore");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("This website is unavailable.");
    await act(async () => button("Try again").click());
    expect(button("Pair a service").disabled).toBe(true);
    expect(container.textContent).toContain("Both the business record and website need a service");
    await act(async () => root!.render(createElement(NativeFactMappings, { workspaceId: WS, sites, request, readOnly: true })));
    expect(container.innerHTML).toBe("");
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => root!.render(createElement(NativeFactMappings, { key: "empty", workspaceId: WS, sites: [], request })));
    expect(container.textContent).toContain("No native website is available");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
