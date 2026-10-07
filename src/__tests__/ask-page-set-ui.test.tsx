// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SiteDocumentTry } from "@/products/websites/SiteDocumentTry";
import { composeAskPageSet } from "@/products/websites/ask-page-set";

it("tries real native pages with keyboard-compatible links and no network or record writes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const document = composeAskPageSet("Example", { kind: "website-pages", pages: [
    { path: "/", title: "Home", description: "First page", paragraphs: ["Home page content"] },
    { path: "/services", title: "Services", description: "Second page", paragraphs: ["Real second page content"] },
  ] }).document;
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SiteDocumentTry, { document })));
    expect(container.textContent).toContain("Home page content");
    expect(container.textContent).not.toContain("Real second page content");
    const link = container.querySelector<HTMLAnchorElement>('a[href="/services"]')!;
    link.focus();
    expect(window.document.activeElement).toBe(link);
    await act(async () => link.click());
    expect(container.textContent).toContain("Real second page content");
    expect(container.textContent).not.toContain("Home page content");
    expect(container.querySelector("form")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("tries the real booking form locally and discards visitor information without provider or record writes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const document = composeAskPageSet("Example", { kind: "website-pages", pages: [
    { path: "/", title: "Home", description: "Existing home", paragraphs: ["Existing copy"] },
    { path: "/book", title: "Book a time", description: "Existing consulting service", paragraphs: ["Configured service"] },
  ] }).document;
  document.nodes.test_booking = { id: "test_booking", type: "Booking", variant: "inline", props: { title: "Book a time" }, children: [], factIds: [] };
  document.nodes.page_1!.children.push("test_booking");
  document.capabilities = { baseUrl: "https://app.example.test", tenant: "example", booking: { capabilityId: "consult", version: 3, range: { from: "2026-10-10T12:00:00Z", to: "2026-10-10T13:00:00Z" } } };
  const bookingSchedule = { schemaVersion: 1 as const, capabilityId: "consult", version: 3, name: "Consulting", provider: "google" as const, timeZone: "UTC", slots: [{ id: "test-slot-one", start: "2026-10-10T12:00:00Z", end: "2026-10-10T13:00:00Z" }] };
  const storage = JSON.stringify({ ...window.localStorage });
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SiteDocumentTry, { document, bookingSchedule })));
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/book"]')!.click());
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.textContent).toContain("configured test time");
    const fields = [...container.querySelectorAll<HTMLInputElement>('input')];
    const name = fields.find(field => field.type === "text")!;
    const email = fields.find(field => field.type === "email")!;
    for (const [field, value] of [[name, "Test Visitor"], [email, "visitor@example.test"]] as const) {
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
    }
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Test booking completed");
    expect(container.textContent).toContain("no calendar changed");
    expect(container.textContent).not.toContain("Test Visitor");
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...window.localStorage })).toBe(storage);
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});
