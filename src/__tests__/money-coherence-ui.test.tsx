// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanWaitlist } from "@/experience/workspace/billing/PlanWaitlist";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { AgencyPayerRequests, AgencyCoverHeadline } from "@/experience/workspace/billing/AgencyPayerRequests";
import { PaymentsScreen } from "@/app/workspace/payments/PaymentsScreen";
import ReviewQueue from "@/app/workspace/money-reconciliation/ReviewQueue";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const roots: ReturnType<typeof createRoot>[] = [];
function host() { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); return { node, root }; }
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.startsWith(label));
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("money screens say one thing at a time (October 16)", () => {
  it("taking a business off the plans list is a live act with its own Undo that rejoins", async () => {
    const { node, root } = host();
    const transport = vi.fn(async (_url: string, init?: RequestInit) => Response.json(JSON.parse(String(init?.body)).action === "leave" ? { joined: false } : { joined: true, email: "owner@example.test" }));
    await act(async () => root.render(createElement(PlanWaitlist, { workspaceId: "w", businessName: "Harbor Dental", agencyHref: "/help", joinedEmail: "owner@example.test", transport })));
    await act(async () => button(node, "Take Harbor Dental off the list")!.click());
    expect(node.textContent).toContain("Harbor Dental is off the list");
    await act(async () => button(node, "Undo")!.click());
    expect(JSON.parse(String(transport.mock.calls[1]![1]!.body))).toEqual({ workspaceId: "w", action: "join" });
    expect(node.textContent).toContain("You’re on the list. Nothing is sent or charged until plans open.");
  });

  it("who pays follows the billing record when no change is agreed, and says which counts when they disagree", async () => {
    const accepted = { id: "t", workspaceId: "w", successorKind: "business", canRespond: false, successorUserId: "", successorEmail: "", successorWorkspaceId: null, successorWorkspaceName: null, proposerEmail: "o@example.test", proposerName: "Dr. Amy Lin", status: "accepted", proposedAt: "2026-10-01T09:00:00Z", resolvedAt: "2026-10-02T14:00:00Z", acceptedAt: "2026-10-02T14:00:00Z", workspaceName: "Harbor Dental" };
    const north = { kind: "agency" as const, workspaceId: "a", name: "North Studio" };
    const none = host();
    await act(async () => none.root.render(createElement(WorkspacePayerTransition, { workspaceId: "w", canPropose: true, billedTo: north, request: vi.fn<typeof fetch>(async () => Response.json({ transitions: [], current: null, pending: null, currentActorId: "u" })) })));
    expect(none.node.textContent).toContain("North Studio pays for this business’s Strelva work.");
    expect(none.node.textContent).not.toContain("pays for its own");
    const disagree = host();
    await act(async () => disagree.root.render(createElement(WorkspacePayerTransition, { workspaceId: "w", canPropose: true, billedTo: north, request: vi.fn<typeof fetch>(async () => Response.json({ transitions: [accepted], current: accepted, pending: null, currentActorId: "u" })) })));
    expect(disagree.node.textContent).toContain("The billing record still names North Studio; the agreed change is the one that counts.");
  });

  it("puts a waiting change's status on its own line, its answer after it", async () => {
    const pending = { id: "p", workspaceId: "w", successorKind: "agency", canRespond: false, successorUserId: "", successorEmail: "", successorWorkspaceId: "a", successorWorkspaceName: "North Studio", proposerEmail: "o@example.test", proposerName: "Dr. Amy Lin", status: "pending", proposedAt: "2026-10-14T15:12:00Z", resolvedAt: null, acceptedAt: null, workspaceName: "Harbor Dental" };
    const { node, root } = host();
    await act(async () => root.render(createElement(WorkspacePayerTransition, { workspaceId: "w", canPropose: true, request: vi.fn<typeof fetch>(async () => Response.json({ transitions: [pending], current: null, pending, currentActorId: "u" })) })));
    const group = node.querySelector('[aria-label="A change to who pays, waiting for an answer"]')!;
    const title = group.querySelector("p")!;
    expect(title.textContent).toBe("North Studio to pay from now on");
    expect(title.textContent).not.toContain("Take it back");
  });

  it("counts only accepted coverage in the agency headline", async () => {
    const asking = { id: "p", workspaceId: "harbor", workspaceName: "Harbor Dental", successorKind: "agency", successorWorkspaceId: "north", status: "pending", canRespond: true, proposerEmail: "o@example.test" };
    const { node, root } = host();
    await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "north", agencyName: "North Studio", request: vi.fn<typeof fetch>(async () => Response.json({ transitions: [asking], current: null, pending: null, currentActorId: "m" })) }, createElement(AgencyCoverHeadline, { agencyName: "North Studio", clientIds: ["harbor", "coast", "field"], quiet: "Nothing is charged." }))));
    expect(node.textContent).toContain("North Studio covers Strelva for 2 clients, 1 more asking.");
  });

  it("lists a paid-but-unconfirmed payment once, with Pebble naming what happens next", () => {
    const html = renderToStaticMarkup(createElement(PaymentsScreen, {
      workspaceId: "w",
      money: { account: { state: "ready" }, payments: [{ id: "pay", amount_cents: 12000, currency: "usd", purpose: "deposit", reference_id: "req", created_at: "2026-10-15T15:00:00Z" }], events: [] },
      sources: [],
      requests: [{ id: "req", kind: "deposit", amount_cents: 12000, currency: "usd", status: "unpaid", refundRequired: false, lines: [{ name: "Priscilla N. · Dec 1 cleaning deposit" }], issued_at: "2026-10-14T15:00:00Z", expires_at: "2026-10-21T15:00:00Z" }],
    }));
    expect(html.match(/Priscilla N\. · Dec 1 cleaning deposit/g)).toHaveLength(2); // the row, and Pebble's sentence
    expect(html).not.toContain("Waiting on the customer");
    expect(html).toContain("Strelva checks again on its own");
  });

  it("gives each reconciliation item a sentence and keeps Stripe ids behind Stripe details", () => {
    const html = renderToStaticMarkup(createElement(ReviewQueue, {
      issues: [{ account_id: "acct_x", event_id: "evt_1", reason: "unmatched_payment", event_type: "payment_intent.succeeded", object_id: "pi_1", created_at: "2026-10-14T16:05:00Z", amount_cents: 30000, currency: "usd", resolution: null }],
      accountNames: { acct_x: "North Studio" },
    }));
    expect(html).toContain("North Studio’s Stripe says a $300.00 payment succeeded on Oct 14. Strelva has no record of it.");
    const [before, after] = html.split("Stripe details");
    expect(before).not.toContain("pi_1"); expect(before).not.toContain("payment_intent.succeeded");
    expect(after).toContain("pi_1");
  });
});
