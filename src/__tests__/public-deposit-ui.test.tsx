// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessPayment from "@/app/pay/business/BusinessPayment";
import { DepositPreview } from "@/experience/workspace/preview/DepositPreview";
import { businessDepositFixture as request } from "@/experience/workspace/preview/deposit-fixture";

const token = "a".repeat(64);
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const payButton = () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Accept and pay")!;

describe("business deposit presentation", () => {
  it("keeps the shared-token POST and removes payment action after the provider confirms paid", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "paid" }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: request })));
    expect(container.textContent).toContain("Your booking deposit");
    expect(container.textContent).toContain("$120.00");
    await act(async () => payButton().click());
    expect(fetcher).toHaveBeenCalledWith("/api/v1/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    expect(container.textContent).toContain("Payment received.");
    expect(payButton()).toBeUndefined();
  });

  it.each(["expired", "cancelled", "paid"] as const)("does not offer a charge for %s requests", async status => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: { ...request, status, paid: status === "paid" } })));
    expect(payButton()).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves details and shows a refusal without a navigation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "This payment link is unavailable." }, { status: 403 })));
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: request })));
    await act(async () => payButton().click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("This payment link is unavailable.");
    expect(container.textContent).toContain("$120.00");
    expect(payButton().disabled).toBe(false);
  });

  it.each(["https://example.test/pay", "http://checkout.stripe.com/pay"])("retains the hosted Stripe URL guard for %s", async url => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ url })));
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: request })));
    await act(async () => payButton().click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("invalid link");
  });

  it("uses the current token reader and reports a failed read without a payment button", async () => {
    const fetcher = vi.fn(async (_input: unknown) => Response.json({}, { status: 403 })); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(BusinessPayment, { token })));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/v1/payments?token=${token}`);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Payment details could not be loaded.");
    expect(payButton()).toBeUndefined();
  });
});

describe("fictional deposit preview", () => {
  it("never collects card details or calls a payment provider and labels its simulated result", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(DepositPreview, { state: "ready" })));
    for (const input of container.querySelectorAll("input")) expect(input.readOnly).toBe(true);
    const button = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.startsWith("Pay [deposit]"))!;
    await act(async () => button.click());
    expect(container.textContent).toContain("Deposit received · simulated");
    expect(container.textContent).toContain("has not taken a payment or reserved a spot");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["loading", "empty", "denied"] as const)("offers no charge in its %s state", async state => {
    await act(async () => root.render(createElement(DepositPreview, { state })));
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent?.startsWith("Pay [deposit]"))).toBe(false);
  });
});
