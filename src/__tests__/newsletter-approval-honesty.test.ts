// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Approving a newsletter while email is off must not look handled: the queue
// route answers an error, the page puts the item back and says why.

const mocks = vi.hoisted(() => ({ decide: vi.fn() }));

vi.mock("@/platform/infra/auth", () => ({
  verifyAuth: vi.fn(async () => true),
  requireTenantPermission: vi.fn(async () => null),
}));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: vi.fn(async () => "client-site") }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/operator-decisions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/operator-decisions")>()),
  sessionTenantDecider: vi.fn(async () => ({ kind: "owner", userId: "u1" })),
  decideTenantEvent: (...a: unknown[]) => mocks.decide(...a),
}));

import { newsletterNotSentRefusal } from "@/lib/operator-decisions";
import { PATCH } from "@/app/api/queue/[id]/route";
import { QueuePage } from "@/components/dashboard/QueuePage";
import type { UnifiedEvent } from "@/lib/types";

describe("newsletterNotSentRefusal", () => {
  it("maps each not-sent reason to a status and a plain sentence", () => {
    expect(newsletterNotSentRefusal("paused")).toEqual({ status: 409, error: "Sending is paused. The newsletter was not sent and stays in Needs you." });
    expect(newsletterNotSentRefusal("not_configured")?.status).toBe(409);
    expect(newsletterNotSentRefusal("business_identity_unavailable")?.error).toContain("not sent");
    expect(newsletterNotSentRefusal("no_subscribers")).toEqual({ status: 409, error: "There are no active subscribers. Nothing was sent." });
    expect(newsletterNotSentRefusal("send_failed")?.status).toBe(502);
    expect(newsletterNotSentRefusal("newsletter_invalid")?.status).toBe(422);
  });

  it("leaves other reasons alone", () => {
    expect(newsletterNotSentRefusal("already_resolved")).toBeNull();
    expect(newsletterNotSentRefusal(undefined)).toBeNull();
  });
});

describe("PATCH /api/queue/:id for an unsent newsletter", () => {
  it("answers 409 with the not-sent sentence instead of success", async () => {
    mocks.decide.mockResolvedValue({ changed: false, reason: "paused" });
    const res = await PATCH(
      new Request("http://localhost/api/queue/evt-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approved" }) }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("not sent");
    expect(body.success).toBeUndefined();
  });
});

describe("QueuePage when the newsletter was not sent", () => {
  let root: Root | undefined;
  let container: HTMLDivElement;
  const event = {
    id: "evt-1", tenantId: "client-site", type: "newsletter_draft", status: "pending", title: "Spring newsletter", body: "Hello",
    source: "ai", createdAt: "2026-10-15T00:00:00Z", metadata: {},
  } as unknown as UnifiedEvent;

  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); vi.unstubAllGlobals(); });

  it("puts the item back in Needs you and shows why", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Sending is paused. The newsletter was not sent and stays in Needs you.", notSent: true }, { status: 409 })));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(QueuePage, { initialPending: [event], initialResolved: [], pendingCount: 1 })));
    const approve = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Make it live"))!;
    await act(async () => { approve.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Sending is paused. The newsletter was not sent");
    expect(container.textContent).toContain("Spring newsletter");
  });
});
