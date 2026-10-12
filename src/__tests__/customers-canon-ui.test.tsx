// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomersApp, type CustomersAppProps } from "@/experience/customers/CustomersApp";
import { CUSTOMER_PREVIEW_HOME_FINDER, customerPreviewOrganization, customerPreviewState, type CustomerPreviewScenario } from "@/experience/customers/preview-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
beforeEach(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });
});
afterEach(() => { document.body.innerHTML = ""; });

function props(scenario: CustomerPreviewScenario = "assigned"): CustomersAppProps {
  const state = customerPreviewState(scenario);
  return { ...state, organizationName: customerPreviewOrganization(scenario), scenario, preview: true };
}
function html(overrides: Partial<CustomersAppProps> = {}, scenario: CustomerPreviewScenario = "assigned") {
  return renderToStaticMarkup(createElement(CustomersApp, { ...props(scenario), ...overrides }));
}

describe("Customers paper composition preserves scoped read states", () => {
  it("keeps unknown customer detail out of the rendered read projection and gives a return route", () => {
    const output = html({ requestedCustomerId: "unknown" });
    expect(output).toContain("Customer unavailable");
    expect(output).toContain("Back to Customers");
    expect(output).not.toContain("Authorized resources");
    expect(output).not.toContain("Open Home Finder");
  });
  it("does not display fixture detail or resources when the relationship source is unavailable", () => {
    const output = html({}, "unavailable");
    expect(output).toContain("Nothing has been confirmed");
    expect(output).toContain('role="alert"');
    expect(output).not.toContain("Cedar Lane Homes");
    expect(output).not.toContain("Authorized resources");
  });
  it("does not turn revoked resources into actionable links", () => {
    const output = html({}, "revoked");
    expect(output).toContain("Access revoked");
    expect(output).not.toContain("Open Website");
    expect(output).not.toContain("Open Home Finder");
  });
  it("separates unconfigured resources from absent management evidence", () => {
    const input = props();
    const resource = input.detail!.resources.find(row => row.availability === "not_configured")!;
    const output = html({ initialResourceId: resource.id });
    expect(output).toContain("Home Finder is not set up");
    expect(output).not.toContain("Open buyer preview");
    expect(output).not.toContain("Delivery receipt");
  });
  it("keeps synthetic preview, readiness source, receipt time and read-only constraints visible", () => {
    const output = html({ initialResourceId: CUSTOMER_PREVIEW_HOME_FINDER.resourceId });
    expect(output).toContain("buyer inquiries are not sent or stored");
    expect(output).toContain("Fictional preview configuration");
    expect(output).toContain("UTC");
    expect(output).toContain("does not grant activation");
    expect(output).toContain("Copy access request");
  });
  it("clears the selected customer's resources when search removes the customer from scope", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(CustomersApp, props())));
    expect(container.textContent).toContain("Open Home Finder");
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "no-match");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("No customers match");
    expect(container.textContent).not.toContain("Open Home Finder");
    await act(async () => root.unmount());
  });
});
