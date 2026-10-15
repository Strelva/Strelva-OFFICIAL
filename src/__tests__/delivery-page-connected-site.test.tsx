import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ user: null as null | { id: string; email: string; email_confirmed_at: string }, forRequest: vi.fn(), released: vi.fn(), mayBeOn: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: () => null }));
vi.mock("@/experience/operations/DeliveryCommitmentPanel", () => ({ DeliveryCommitmentPanel: () => null }));
vi.mock("@/experience/connected-sites/ConnectedSiteChanges", () => ({ ConnectedSiteChanges: () => null }));
vi.mock("@/products/connected-sites/server", () => ({
  connectedSiteChangesStore: () => ({ forRequest: deps.forRequest }),
  keepYourSiteMayBeOn: deps.mayBeOn,
  keepYourSiteReleasedFor: deps.released,
}));

import DeliveryPage from "@/app/workspace/delivery/[requestId]/page";
import { ConnectedSiteChanges } from "@/experience/connected-sites/ConnectedSiteChanges";
import { DeliveryCommitmentPanel } from "@/experience/operations/DeliveryCommitmentPanel";

const REQUEST = "7c000000-0000-4000-8000-000000000001";
const WS = "7c000000-0000-4000-8000-000000000002";
const SYSTEM = "7c000000-0000-4000-8000-000000000003";
const page = async () => await DeliveryPage({ params: Promise.resolve({ requestId: REQUEST }) }) as ReactElement<{ children: ReactElement<Record<string, unknown>>; workspaceId?: string }>;

beforeEach(() => {
  deps.user = { id: "7c000000-0000-4000-8000-000000000009", email: "Staff@Example.test", email_confirmed_at: "2026-10-01" };
  deps.mayBeOn.mockReset().mockReturnValue(true);
  deps.released.mockReset().mockResolvedValue(true);
  deps.forRequest.mockReset().mockResolvedValue({ workspaceId: WS, systemId: SYSTEM });
});
afterEach(() => vi.clearAllMocks());

describe("/workspace/delivery/[requestId]", () => {
  it("opens the existing delivery panel while keep your site is off, without reading anything", async () => {
    deps.mayBeOn.mockReturnValue(false);
    const element = await page();
    expect(element.props.children.type).toBe(DeliveryCommitmentPanel);
    expect(deps.forRequest).not.toHaveBeenCalled();
  });
  it("opens the task for a connected-site Request, focused on that Request", async () => {
    const element = await page();
    expect(element.props.children.type).toBe(ConnectedSiteChanges);
    expect(element.props.children.props).toMatchObject({ workspaceId: WS, systemId: SYSTEM, focusRequestId: REQUEST });
    expect(element.props.workspaceId).toBe(WS);
    expect(deps.forRequest).toHaveBeenCalledWith({ userId: "7c000000-0000-4000-8000-000000000009", verifiedEmail: "staff@example.test" }, REQUEST);
  });
  it("falls back to the delivery panel for any other Request", async () => {
    deps.forRequest.mockResolvedValue(null);
    expect((await page()).props.children.type).toBe(DeliveryCommitmentPanel);
  });
  it("falls back when the business has keep your site off, or the read fails, or nobody is signed in", async () => {
    deps.released.mockResolvedValue(false);
    expect((await page()).props.children.type).toBe(DeliveryCommitmentPanel);
    deps.released.mockResolvedValue(true);
    deps.forRequest.mockRejectedValue(new Error("db"));
    expect((await page()).props.children.type).toBe(DeliveryCommitmentPanel);
    deps.user = null;
    expect((await page()).props.children.type).toBe(DeliveryCommitmentPanel);
  });
});
