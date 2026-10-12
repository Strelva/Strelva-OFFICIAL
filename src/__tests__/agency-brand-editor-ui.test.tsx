// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyBrandEditor } from "@/experience/workspace/agency/AgencyBrandEditor";

const agencyId = "22222222-2222-4222-8222-222222222222";
const brand = { displayName: "North Studio", accentColor: "#447a4f", replyTo: "reply@example.test", logo: null, credit: "runs_on_strelva" };
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = ""; vi.unstubAllGlobals();
});
async function render(request = vi.fn<typeof fetch>(async () => Response.json({ brand }))) {
  vi.stubGlobal("fetch", request);
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(<AgencyBrandEditor workspaceId={agencyId} />));
  return { node, request, root };
}
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent === label)!;
async function submit(node: HTMLElement) {
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

it("uses labelled kit color and file fields and saves the chosen color", async () => {
  const { node, request } = await render();
  const color = node.querySelector<HTMLInputElement>('input[type="color"]')!;
  expect([...node.querySelectorAll("label")].find(label => label.htmlFor === color.id)?.textContent).toBe("Accent color");
  expect(node.querySelector('input[type="file"]')?.getAttribute("accept")).toBe("image/png,image/jpeg,image/webp");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(color, "#123456");
    color.dispatchEvent(new Event("input", { bubbles: true }));
    color.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await submit(node);
  const write = request.mock.calls.find(call => call[1]?.method === "PUT")!;
  expect(JSON.parse(String(write[1]?.body))).toMatchObject({ workspaceId: agencyId, brand: { accentColor: "#123456" } });
});

it("keeps initial lookup failure neutral and provides read recovery", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ error: "Agency brand unavailable" }, { status: 503 })).mockResolvedValue(Response.json({ brand }));
  const { node } = await render(request);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("Agency brand unavailable");
  expect(node.querySelector("form")).toBeNull();
  expect(node.textContent).not.toContain("Strelva");
  await act(async () => button(node, "Read saved brand").click());
  expect(node.querySelector("form")).not.toBeNull();
});

it("holds uncertain saves until the recorded brand can be reread", async () => {
  let reads = 0;
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "PUT") throw new Error("Response lost");
    if (++reads === 2) return Response.json({ error: "Read unavailable" }, { status: 503 });
    return Response.json({ brand });
  });
  const { node } = await render(request);
  await submit(node);
  expect(node.textContent).toContain("Read the saved brand before trying again");
  expect(button(node, "Save brand").disabled).toBe(true);
  await submit(node);
  expect(request.mock.calls.filter(call => call[1]?.method === "PUT")).toHaveLength(1);
  await act(async () => button(node, "Read saved brand").click());
  expect(button(node, "Save brand").disabled).toBe(true);
  await act(async () => button(node, "Read saved brand").click());
  expect(button(node, "Save brand").disabled).toBe(false);
});

it("rejects unsupported logos before reading or saving them", async () => {
  const { node, request } = await render();
  const file = node.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(file, "files", { value: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] });
  await act(async () => file.dispatchEvent(new Event("change", { bubbles: true })));
  expect(node.textContent).toContain("Use a PNG, JPEG or WebP up to 256 KiB");
  expect(request.mock.calls.some(call => call[1]?.method === "PUT")).toBe(false);
});

it("drops an earlier agency's brand when switching workspace", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ brand })).mockResolvedValueOnce(Response.json({ error: "No access" }, { status: 403 }));
  const { node, root } = await render(request);
  await act(async () => root.render(<AgencyBrandEditor workspaceId="33333333-3333-4333-8333-333333333333" />));
  expect(node.querySelector("form")).toBeNull();
  expect(node.textContent).not.toContain("North Studio");
});
