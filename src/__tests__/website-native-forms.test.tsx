// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteLeadForm } from "@/products/websites/SiteLeadForm";
import { StrelvaConnectedInquiryForm } from "../../custom-repo-starter/StrelvaInquiryForm";
import { StrelvaConnectedBookingForm } from "../../custom-repo-starter/StrelvaBookingForm";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const inquiry = { schemaVersion: 1, capabilityId: "main", version: 2, name: "Inquiries", form: { component: "form", id: "main", title: "Contact us", intro: "Send a request", disclosure: "Strelva", fields: [{ id: "name", label: "Name", kind: "text", component: "text_field", required: true }] } };
const schedule = { schemaVersion: 1, capabilityId: "calendar", version: 2, name: "Consultation", provider: "outlook", timeZone: "America/New_York", slots: [] };

describe("hosted native website forms", () => {
  it("keeps visitor input on a failed native lead write, and sends only to the bound tenant", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Inquiry capture unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(SiteLeadForm, { tenant: "first-business" })));
    const name = container.querySelector<HTMLInputElement>('[name="name"]')!; name.value = "[Visitor name]";
    const email = container.querySelector<HTMLInputElement>('[name="email"]')!; email.value = "visitor@example.test";
    const message = container.querySelector<HTMLTextAreaElement>('[name="message"]')!; message.value = "Please contact me.";
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/leads/first-business");
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body)).toMatchObject({ name: "[Visitor name]", email: "visitor@example.test", message: "Please contact me.", source: "hosted-site" });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Inquiry capture unavailable");
    expect(name.value).toBe("[Visitor name]");
    expect(email.value).toBe("visitor@example.test");
    expect(message.value).toBe("Please contact me.");
    expect(container.querySelector("button")?.disabled).toBe(false);
  });
  it("confirms and resets a successful native lead capture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await act(async () => root.render(createElement(SiteLeadForm, { tenant: "second-business" })));
    container.querySelector<HTMLInputElement>('[name="name"]')!.value = "[Visitor name]";
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Your request has been received.");
    expect(container.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("");
  });
  it("does not submit an inquiry whose public definition differs from the approved version", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(inquiry), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(StrelvaConnectedInquiryForm, { baseUrl: "https://app.example", tenant: "first-business", capabilityId: "main", expectedVersion: 1 })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("This form changed");
    expect(container.querySelector("form")).toBeNull();
    expect(fetcher.mock.calls.length).toBe(1);
  });
  it("does not reserve a booking against a changed approved schedule", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(schedule), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(StrelvaConnectedBookingForm, { baseUrl: "https://app.example", tenant: "second-business", capabilityId: "calendar", expectedVersion: 1, range: { from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" } })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("This booking schedule changed");
    expect(container.querySelector("form")).toBeNull();
    expect(fetcher.mock.calls.length).toBe(1);
  });
});
