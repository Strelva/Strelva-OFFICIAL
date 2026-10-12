// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayLinksView } from "@/app/admin/pay-links/PayLinksView";
import { OnboardForm } from "@/app/admin/onboard/OnboardForm";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("siteName=Example&ownerEmail=owner%40example.test&leadToken=lead-1") }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function fill(label: string, value: string) {
  const control = [...host.querySelectorAll("label")].find(node => node.textContent === label)?.nextElementSibling as HTMLInputElement;
  expect(control?.tagName).toBe("INPUT");
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(label: string) { const button = [...host.querySelectorAll("button")].find(node => node.textContent === label); expect(button).toBeDefined(); await act(async () => button!.click()); }

describe("operator admin form presentation", () => {
  it("keeps existing payments available for inspection without sales controls", async () => {
    const request = vi.fn<typeof fetch>();
    await act(async () => root.render(createElement(PayLinksView, { request, preview: true, initialLinks: [{ slug: "example", clientName: "Example", amountCents: 12500 }] })));
    expect(host.textContent).toContain("/pay/example");
    expect(host.textContent).toContain("Platform support cannot create, edit or revoke");
    expect(host.querySelector('a[href="/admin/actions"]')).not.toBeNull();
    expect(host.querySelector("input")).toBeNull();
    expect(Array.from(host.querySelectorAll("button")).some(button => /Create|Revoke/.test(button.textContent || ""))).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("shows a refused payment read as an error instead of treating it as an empty successful read", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:"Operator access required"}, {status:403}));
    await act(async () => root.render(createElement(PayLinksView, {request})));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Operator access required");
    expect(host.textContent).toContain("Payment link availability is unknown.");
    expect(host.querySelector("input")).toBeNull();
  });

  it("keeps lead prefill, validation and provision body while showing returned step failures", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({tenantId:"example",siteUrl:"https://example.test",steps:[{key:"hosting",label:"Hosting",status:"failed",detail:"Hosting unavailable"}],manualNext:[],clientEnv:{}}));
    await act(async () => root.render(createElement(OnboardForm, {request,preview:true})));
    expect(host.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe("owner@example.test");
    await click("Create Strelva Agency site record"); expect(request).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("required");
    await fill("Subdomain *", "example"); await fill("Owner name *", "Owner");
    await act(async () => { const select=host.querySelector("select")!; select.value="professional"; select.dispatchEvent(new Event("change",{bubbles:true})); });
    await click("Create Strelva Agency site record");
    expect(request).toHaveBeenCalledWith("/api/admin/provision", expect.objectContaining({method:"POST",body:JSON.stringify({subdomain:"example",siteName:"Example",ownerName:"Owner",ownerEmail:"owner@example.test",industry:"professional",productionDomain:"",presence:"local",leadToken:"lead-1"})}));
    expect(host.textContent).toContain("Created with steps to review"); expect(host.textContent).toContain("Hosting unavailable");
    expect(host.querySelector('a[href="/admin/clients/example"]')).not.toBeNull();
  });
});
