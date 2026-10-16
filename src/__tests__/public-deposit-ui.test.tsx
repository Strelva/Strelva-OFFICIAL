// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessPayment from "@/app/pay/business/BusinessPayment";
import { DepositPreview } from "@/experience/workspace/preview/DepositPreview";
import { businessDepositFixture } from "@/experience/workspace/preview/deposit-fixture";

const token = "a".repeat(64);
const request = { ...businessDepositFixture, businessName: "Lakeview Yoga" };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const payButton = () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Accept and pay")!;

describe("business deposit presentation", () => {
  it.each([undefined, null, {}, { refundable: "yes" }])("holds a deposit when immutable policy is missing or invalid: %s", async cancellationPolicy => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: { ...request, cancellationPolicy, acceptedTerms: "Work description alone is not a deposit policy." } })));
    expect(container.textContent).toContain("doesn’t say what happens if you cancel");
    expect(payButton()).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([true, false])("shows the issued refundable=%s policy with what was agreed, the amount beside it", async refundable => {
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: { ...request, cancellationPolicy: { refundable } } })));
    expect(container.querySelector('[aria-label="Payment amount"]')!.textContent).toContain("$120.00");
    const agreed = container.querySelector('[aria-label="What was agreed"]')!;
    expect(agreed.textContent).toContain(refundable ? "eligible for a refund" : "non-refundable");
    expect(agreed.textContent).toContain("Pay by");
    expect(payButton()).toBeDefined();
    expect(container.querySelector("main")?.textContent).not.toContain("Strelva");
  });

  it("keeps immutable quote agreement text with what was agreed", async () => {
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: { ...request, kind: "quote", cancellationPolicy: {}, acceptedTerms: "Agreed cancellation terms: refundable before work starts." } })));
    expect(container.querySelector('[aria-label="What was agreed"]')?.textContent).toContain("Agreed cancellation terms: refundable before work starts.");
    expect(payButton()).toBeDefined();
  });

  it("wears the business's own accent when the payment read carries it, and drops a malformed one", async () => {
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: { ...request, cancellationPolicy: { refundable: true }, brand: { accentColor: "#1f4e6b", logoUrl: null } } })));
    expect(container.querySelector("main")!.getAttribute("style")).toContain("--visitor-accent: #1f4e6b");
    const { publicPaymentRequestSchema } = await import("@/platform/connect/public-payment");
    expect(publicPaymentRequestSchema.parse({ ...request, brand: { accentColor: "red" } }).brand).toBeNull();
  });

  it("holds a quote without either agreement text or a valid immutable refund policy", async () => {
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: { ...request, kind: "quote", cancellationPolicy: {}, acceptedTerms: "  " } })));
    expect(payButton()).toBeUndefined();
  });

  it("retains refund terms from the token read and uses them before accepting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...request, cancellationPolicy: { refundable: false } })));
    await act(async () => root.render(createElement(BusinessPayment, { token })));
    expect(container.textContent).toContain("non-refundable");
    expect(payButton()).toBeDefined();
    // The pay-by day in words, never a raw clock time with a zone id.
    expect(container.querySelector("time")?.textContent).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  it("keeps the shared-token POST and removes payment action after the provider confirms paid", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "paid" }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: request })));
    expect(container.textContent).toContain("Your booking deposit");
    expect(container.textContent).toContain("$120.00");
    await act(async () => payButton().click());
    expect(fetcher).toHaveBeenCalledWith("/api/v1/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    expect(container.textContent).toContain("Paid. Thank you.");
    expect(payButton()).toBeUndefined();
  });

  it("withholds payment when the public request has no business identity", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(BusinessPayment, { token, initialRequest: { ...businessDepositFixture, businessName: undefined } })));
    expect(container.textContent).toContain("which business it");
    expect(payButton()).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
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
    expect(container.textContent).toContain("has not taken a payment or held a spot");
    expect(fetcher).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/reservation|Strelva/);
  });

  it.each(["loading", "empty", "denied"] as const)("offers no charge in its %s state", async state => {
    await act(async () => root.render(createElement(DepositPreview, { state })));
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent?.startsWith("Pay [deposit]"))).toBe(false);
  });
});
