// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavList } from "@/app/admin/AdminRail";
import { AdminMobileNav } from "@/app/admin/AdminMobileNav";
import { CommandPalette } from "@/app/admin/CommandPalette";
import { OPERATOR_DESTINATIONS, operatorDestinations } from "@/experience/operator/destinations";
const route = vi.hoisted(() => ({ pathname: "/admin/client-leads/inquiries", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: route.push }) }));
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("operator navigation parity", () => {
  it("selects only the exact reachable inquiry destination in the rail", () => {
    act(() => root.render(createElement(NavList, { badges: {}, moneyEnabled: true })));
    const selected = host.querySelectorAll('a[aria-current="page"]');
    expect(selected).toHaveLength(1); expect(selected[0]?.textContent).toBe("Inquiry review");
    for (const destination of operatorDestinations({ moneyEnabled: true })) {
      expect(host.querySelector(`a[href="${destination.href}"]`)?.textContent).toBe(destination.label);
    }
    expect(host.textContent).toContain("Strelva Agency");
    expect(host.querySelector('a[href="/admin/money"]')).not.toBeNull();
    act(() => root.render(createElement(NavList, { badges: {}, moneyEnabled: false })));
    expect(host.querySelector('a[href="/admin/money"]')).toBeNull();
  });
  it("offers the same destinations on a phone and closes on Escape", async () => {
    act(() => root.render(createElement(AdminMobileNav, { moneyEnabled: true })));
    await act(async () => (host.querySelector('button[aria-label="Open menu"]') as HTMLButtonElement).click());
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const dialog = host.querySelector('[role="dialog"]')!;
    for (const destination of operatorDestinations({ moneyEnabled: true })) expect(dialog.querySelector(`nav a[href="${destination.href}"]`)?.textContent).toBe(destination.label);
    const first = dialog.querySelector<HTMLAnchorElement>("a")!;
    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement?.tagName).toBe("SUMMARY");
    const disclosure = dialog.querySelector("details")!;
    disclosure.open = true;
    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement?.getAttribute("href")).toBe(OPERATOR_DESTINATIONS.maintenance.href);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.style.overflow).toBe("");
  });
  it("includes every destination in the palette, including site cleanup and the enabled money view", async () => {
    act(() => root.render(createElement(CommandPalette, { tenants: [{ id: "mooney", siteName: "The Mooney Firm" }], moneyEnabled: true })));
    await act(async () => window.dispatchEvent(new Event("strelva:cmdk")));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("li button")];
    for (const destination of operatorDestinations({ moneyEnabled: true })) expect(buttons.some(button => button.firstElementChild?.textContent === destination.label)).toBe(true);
    const cleanup = buttons.find(button => button.firstElementChild?.textContent === `${OPERATOR_DESTINATIONS.cleanup.label} · The Mooney Firm`)!;
    await act(async () => cleanup.click());
    expect(route.push).toHaveBeenCalledWith("/admin/tenant-cleanup/mooney");
  });
});
