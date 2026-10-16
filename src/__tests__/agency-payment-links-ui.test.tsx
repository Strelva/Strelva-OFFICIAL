// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyPaymentLinks } from "@/experience/workspace/billing/AgencyPaymentLinks";

const agency = "11111111-1111-4111-8111-111111111111";
const actor = "44444444-4444-4444-8444-444444444444";
const legacy = {
  slug: "coffee",
  clientName: "Coffee Co",
  door: "build",
  amountCents: 50000,
  leadSlug: "coffee",
  createdAt: "2026-07-01",
  createdBy: "old@example.test",
};
const snapshot = (extra: Record<string, unknown> = {}) => ({
  agency: { id: agency, name: "Strelva Agency", role: "owner" },
  currentActorId: actor,
  legacyMerchant: true,
  checkoutAvailability: { status: "coming_soon" },
  payLinks: [legacy],
  paidPayments: { coffee: { amountCents: 50000, paidAt: "2026-10-12" } },
  paymentStatusAvailable: true,
  connectedLinks: [],
  creation: { enabled: false, reason: "off" },
  clients: [
    {
      customerWorkspaceId: "33333333-3333-4333-8333-333333333333",
      name: "Client Coffee",
    },
  ],
  ...extra,
});
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("FormData", window.FormData);
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function render(
  request: typeof fetch,
  initialProspect?: { token?: string; name: string; description: string },
) {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  roots.push(root);
  await act(async () =>
    root.render(
      <AgencyPaymentLinks
        agencyWorkspaceId={agency}
        request={request}
        initialProspect={initialProspect}
      />,
    ),
  );
  return node;
}
const button = (node: HTMLElement, label: string) =>
  [...node.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  )!;
async function expire(node: HTMLElement) {
  await act(async () => button(node, "Expire link").click());
  await act(async () => button(node, "Confirm expire").click());
}
it.each([true, false])(
  "shows the same not-yet state for legacy merchant %s without a creation form",
  async (legacyMerchant) => {
    const node = await render(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(snapshot({ legacyMerchant }))),
    );
    expect(node.querySelector("form")).toBeNull();
    expect(button(node, "Create payment link")).toBeUndefined();
    expect(node.textContent).toContain("New payment links open once");
    expect(node.textContent).toContain("its own Stripe account");
  },
);
it("shows paid status and historical attribution without inventing the old actor", async () => {
  const node = await render(
    vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot())),
  );
  expect(node.textContent).toContain(
    "Made before Strelva recorded who made links",
  );
  expect(node.textContent).not.toContain("old@example.test");
  expect(node.textContent).toContain("Paid $500");
  expect(button(node, "Copy link")).toBeTruthy();
});
it("recovers a denied initial read with GET only", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ error: "Access denied" }, { status: 403 }),
    )
    .mockResolvedValueOnce(
      Response.json(snapshot({ payLinks: [], paidPayments: {} })),
    );
  const node = await render(request);
  expect(node.textContent).toContain("Access denied");
  expect(node.querySelector("form")).toBeNull();
  expect(button(node, "Refresh payment links")).toBeUndefined();
  await act(async () => button(node, "Try again").click());
  expect(node.textContent).toContain("No payment links recorded yet");
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it("labels payment uncertainty and expired records, with no copy or expire action for the latter", async () => {
  const node = await render(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          snapshot({
            payLinks: [{ ...legacy, revokedAt: "2026-10-12" }],
            paidPayments: {},
            paymentStatusAvailable: false,
          }),
        ),
      ),
  );
  expect(node.textContent).toContain("Payment status unavailable");
  expect(node.textContent).toContain("Expired");
  expect(button(node, "Copy link")).toBeUndefined();
  expect(button(node, "Expire link")).toBeUndefined();
});
it("holds exact expiration terms after a lost response and retries the same key", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot());
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    if (bodies.length === 1) throw new Error("Response lost");
    return Response.json({
      payLink: { ...legacy, revokedAt: "2026-10-12", revokedBy: actor },
    });
  });
  const node = await render(request);
  await expire(node);
  await act(async () => button(node, "Try again").click());
  expect(bodies).toHaveLength(1);
  await act(async () => button(node, "Retry the same request").click());
  expect(bodies[1]).toEqual(bodies[0]);
  expect(node.textContent).toContain("Payment link expired");
});
it("does not confirm an incomplete expiration response", async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(
      init?.method === "POST"
        ? { payLink: { slug: "unexpected" } }
        : snapshot(),
    ),
  );
  const node = await render(request);
  await expire(node);
  expect(node.textContent).toContain("awaiting confirmation");
  expect(button(node, "Confirm expire").disabled).toBe(true);
});
it("requires an explicit expire review and preserves the server's first revocation receipt", async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST")
      return Response.json({
        payLink: { ...legacy, revokedAt: "2026-10-12", revokedBy: actor },
      });
    return Response.json(snapshot());
  });
  const node = await render(request);
  await act(async () => button(node, "Expire link").click());
  expect(request).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain(
    "Payments already started in Stripe may still complete",
  );
  await act(async () => button(node, "Confirm expire").click());
  expect(JSON.parse(String(request.mock.calls[1]![1]?.body))).toMatchObject({
    action: "revoke",
    agencyWorkspaceId: agency,
    slug: "coffee",
  });
  expect(node.textContent).toContain("Payment link expired");
});
it("copies the public payment URL and reports clipboard failure", async () => {
  const clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboard },
    configurable: true,
  });
  const node = await render(
    vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot())),
  );
  await act(async () => button(node, "Copy link").click());
  expect(clipboard).toHaveBeenCalledWith(
    new URL("/pay/coffee", window.location.origin).toString(),
  );
  expect(node.textContent).toContain("Payment link copied");
  clipboard.mockRejectedValueOnce(new Error("denied"));
  await act(async () => button(node, "Copy link").click());
  expect(node.textContent).toContain(
    "Open the payment link and copy its address",
  );
});

it("keeps an uncertain request held when later authorization is refused", async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot());
    if (
      request.mock.calls.filter(([, config]) => config?.method === "POST")
        .length === 1
    )
      throw new Error("Response lost");
    return Response.json({ error: "Access changed" }, { status: 403 });
  });
  const node = await render(request);
  await expire(node);
  await act(async () => button(node, "Retry the same request").click());
  expect(node.textContent).toContain("Access changed");
  expect(node.textContent).toContain("awaiting confirmation");
  expect(button(node, "Confirm expire").disabled).toBe(true);
});

const row = (over: Record<string, unknown> = {}) => ({
  id: "66666666-6666-4666-8666-666666666666",
  slug: "harbor-site",
  rail: "connected_account",
  clientName: "Harbor Dental",
  description: "Website setup",
  amountCents: 50000,
  minCents: null,
  maxCents: null,
  status: "open",
  invoiceNumber: 1,
  receiptNumber: null,
  paidAt: null,
  paidAmountCents: null,
  revokedAt: null,
  createdAt: "2026-10-15T12:00:00Z",
  ...over,
});
const ready = (extra: Record<string, unknown> = {}) =>
  snapshot({
    legacyMerchant: false,
    payLinks: [],
    paidPayments: {},
    creation: { enabled: true, reason: "ready" },
    ...extra,
  });
const type = async (node: HTMLElement, label: string, value: string) => {
  const input = [...node.querySelectorAll("label")]
    .find((item) => item.textContent?.startsWith(label))!
    .closest("div")!
    .querySelector("input,textarea,select") as HTMLInputElement;
  const proto =
    input instanceof window.HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : input instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(
      new Event(
        input instanceof window.HTMLSelectElement ? "change" : "input",
        { bubbles: true },
      ),
    );
  });
};
const submit = async (node: HTMLElement) => {
  await act(async () => {
    node
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

it("asks for Stripe setup first and sends people back to this page", async () => {
  const request = vi.fn<typeof fetch>(async (url, init) =>
    init?.method === "POST"
      ? Response.json({ url: "https://connect.stripe.com/setup" })
      : Response.json(
          snapshot({
            legacyMerchant: false,
            payLinks: [],
            creation: { enabled: true, reason: "setup_required" },
          }),
        ),
  );
  vi.stubGlobal("fetch", request);
  const node = await render(request);
  expect(node.textContent).toContain(
    "Strelva charges no fee on these payments",
  );
  expect(node.querySelector("form")).toBeNull();
  vi.stubGlobal("location", {
    ...window.location,
    assign: vi.fn(),
    search: "",
  });
  await act(async () => button(node, "Set up Stripe").click());
  const post = request.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(post[1]!.body))).toMatchObject({
    workspaceId: agency,
    action: "onboard",
    returnTo: "payment-links",
    configurations: ["merchant"],
  });
});
it("says readiness could not be confirmed when Stripe cannot be read", async () => {
  const node = await render(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          snapshot({
            legacyMerchant: false,
            creation: { enabled: true, reason: "unavailable" },
          }),
        ),
      ),
  );
  expect(node.textContent).toContain(
    "Payment readiness could not be confirmed",
  );
  expect(node.querySelector("form")).toBeNull();
});
it("creates a fixed link with the exact cents and confirms it", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(ready());
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    return Response.json({
      payLink: row({
        slug: "harbor-dental-abcdef",
        clientName: body.clientName,
      }),
    });
  });
  const node = await render(request, {
    name: "Harbor Dental",
    description: "Website setup",
  });
  await type(node, "Amount in dollars", "1250.50");
  await submit(node);
  expect(bodies[0]).toMatchObject({
    action: "create",
    agencyWorkspaceId: agency,
    clientName: "Harbor Dental",
    description: "Website setup",
    amountCents: 125050,
    expectedActorId: actor,
  });
  expect(bodies[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(node.textContent).toContain("Strelva does not email payment links");
});
it("blocks a range whose span is not whole $50 steps before any request", async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json(ready()));
  const node = await render(request, {
    name: "Harbor Dental",
    description: "Care plan",
  });
  await act(async () =>
    [...node.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((item) => item.textContent === "Client picks within a range")!
      .click(),
  );
  await type(node, "Minimum in whole dollars", "100");
  await type(node, "Maximum in whole dollars", "175");
  await submit(node);
  expect(node.textContent).toContain("$50 steps");
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it("sends a valid range as cents", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(ready());
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    return Response.json({ payLink: row({ clientName: body.clientName }) });
  });
  const node = await render(request, {
    name: "Harbor Dental",
    description: "Care plan",
  });
  await act(async () =>
    [...node.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((item) => item.textContent === "Client picks within a range")!
      .click(),
  );
  await type(node, "Minimum in whole dollars", "100");
  await type(node, "Maximum in whole dollars", "300");
  await submit(node);
  expect(bodies[0]).toMatchObject({ minCents: 10000, maxCents: 30000 });
  expect(bodies[0]).not.toHaveProperty("amountCents");
});
it("lists connected links with their invoice number, status and actions", async () => {
  const node = await render(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          ready({
            connectedLinks: [
              row(),
              row({
                id: "77777777-7777-4777-8777-777777777777",
                slug: "paid-one",
                status: "paid",
                invoiceNumber: 2,
                receiptNumber: 1,
                paidAmountCents: 50000,
                paidAt: "2026-10-16T00:00:00Z",
              }),
              row({
                id: "88888888-8888-4888-8888-888888888888",
                slug: "old-one",
                status: "expired",
                invoiceNumber: 3,
                revokedAt: "2026-10-16T00:00:00Z",
              }),
            ],
          }),
        ),
      ),
  );
  expect(node.textContent).toContain("INV-000001");
  expect(node.textContent).toContain("INV-000002");
  expect(node.textContent).toContain("Open");
  expect(node.textContent).toContain("Paid $500");
  expect(node.textContent).toContain("Expired");
  expect(button(node, "Copy link")).toBeTruthy();
  expect(button(node, "Expire link")).toBeTruthy();
  const links = [...node.querySelectorAll("a")].map((a) =>
    a.getAttribute("href"),
  );
  expect(links).toContain(
    `/workspace/payment-links/66666666-6666-4666-8666-666666666666/invoice?workspaceId=${agency}`,
  );
  expect(links).toContain(
    `/workspace/payment-links/77777777-7777-4777-8777-777777777777/receipt?workspaceId=${agency}`,
  );
  expect(node.textContent?.match(/Copy link/g)).toHaveLength(1);
});
it("keeps earlier links under their own heading once connected links exist", async () => {
  const node = await render(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          snapshot({
            connectedLinks: [row()],
            creation: { enabled: true, reason: "ready" },
          }),
        ),
      ),
  );
  expect(node.textContent).toContain("Earlier payment links");
});
it("reads the links again when the agency comes back to the tab, without a refresh control", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(snapshot()));
  const node = await render(request);
  expect(button(node, "Refresh payment links")).toBeUndefined();
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 10_000);
  await act(async () => window.dispatchEvent(new Event("focus")));
  clock.mockRestore();
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it("shows no made-up amount in the live preview before one is typed", async () => {
  const node = await render(
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        snapshot({ creation: { enabled: true, reason: "ready" } }),
      ),
    ),
  );
  expect(node.textContent).toContain("Amount appears here");
  expect(node.textContent).not.toContain("$0");
  expect(node.textContent).not.toContain("Pay $");
});
