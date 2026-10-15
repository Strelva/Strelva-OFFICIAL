// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyClientList, AgencyQueueList } from "@/experience/workspace/agency/AgencyViews";
import type { AgencyClientRow, AgencyQueueItem } from "@/experience/workspace/agency-clients";

const AGENCY = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-14T12:00:00Z");
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

const reach = (extra: Partial<NonNullable<AgencyClientRow["ownerReach"]>> = {}): NonNullable<AgencyClientRow["ownerReach"]> => ({
  state: "staff_address", reachable: false, reason: "Owner email on record is a staff address", canIssueClaim: false, contactProposed: false, openDecisions: 0, lapsedRecently: 0, ...extra,
});
const client = (extra: Partial<AgencyClientRow> = {}): AgencyClientRow & { pageIndex: number } => ({
  workspaceId: CLIENT, name: "Harbor Dental", reach: "agency", role: "agency", provider: false, status: "ready", systems: [],
  needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null, pageIndex: 0, ...extra,
});
async function render(node: ReturnType<typeof createElement>) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => root.render(node));
  return host;
}
const list = (clients: ReturnType<typeof client>[]) => createElement(AgencyClientList, {
  clients, total: clients.length, agencyName: "North Studio", hasMore: false, loadingMore: false, moreError: false, retrying: new Set<number>(), now,
  onOpen: () => undefined, onRetryPage: () => undefined, onMore: () => undefined, agencyWorkspaceId: AGENCY,
});

describe("owner reach in Clients", () => {
  it("names a client whose owner cannot be reached, and why", async () => {
    const host = await render(list([client({ ownerReach: reach({ openDecisions: 2, lapsedRecently: 1 }) })]));
    expect(host.textContent).toContain("Owner not reachable");
    expect(host.textContent).toContain("Owner email on record is a staff address");
    expect(host.textContent).toContain("2 owner decisions waiting. Only Harbor Dental can decide.");
    expect(host.textContent).toContain("1 lapsed in the last 30 days, nothing changed");
    expect(host.textContent).toContain("Ask Harbor Dental for the owner's email.");
    expect(host.querySelector(`#owner-${CLIENT}`)).not.toBeNull();
  });

  it("renders nothing about owner reach without the data, as today", async () => {
    const host = await render(list([client()]));
    expect(host.textContent).not.toContain("Owner not reachable");
    expect(host.textContent).not.toContain("Fix owner contact");
  });

  it("sends an agency-added client to the form that makes a fresh owner link", async () => {
    const host = await render(list([client({ ownerReach: reach({ state: "no_contact", reason: "No owner email on record", canIssueClaim: true }) })]));
    const link = [...host.querySelectorAll("a")].find(anchor => anchor.textContent === "Fix owner contact");
    expect(link?.getAttribute("href")).toBe(`/workspace/agency/clients/new?workspaceId=${AGENCY}&client=${CLIENT}`);
  });

  it("offers a converted client's agency the owner's email on Business details, which waits for the owner", async () => {
    const host = await render(list([client({ reach: "member", role: "admin", ownerReach: reach({ state: "no_contact", reason: "No owner email on record" }) })]));
    const link = [...host.querySelectorAll("a")].find(anchor => anchor.textContent === "Add the owner's email");
    expect(link?.getAttribute("href")).toBe(`/workspace/business-details?workspaceId=${CLIENT}`);
    expect(host.textContent).toContain("An address you add waits for the owner to confirm it.");
  });

  it("says a reachable owner is reachable, without alarm", async () => {
    const host = await render(list([client({ ownerReach: reach({ state: "owner_in", reachable: true, reason: "Owner signed in" }) })]));
    expect(host.textContent).toContain("Owner signed in");
    expect(host.textContent).not.toContain("Owner not reachable");
  });
});

describe("owner reach in the Queue", () => {
  const item = (extra: Partial<AgencyQueueItem>): AgencyQueueItem => ({ id: "i1", kind: "needs_you", workspaceId: CLIENT, clientName: "Harbor Dental", title: "Make the website live",
    systemId: null, workId: null, since: "2026-10-13T12:00:00Z", ...extra });
  const queue = (items: AgencyQueueItem[]) => createElement(AgencyQueueList, { items, now, onWorkspace: () => undefined, onOpenClientWork: () => undefined });

  it("shows when an owner decision lapses and that its owner is not reachable, with no way to decide", async () => {
    const host = await render(queue([item({ expiresAt: new Date(now + 2.5 * 86_400_000).toISOString(), ownerReachable: false })]));
    expect(host.textContent).toContain("Lapses in 3 days");
    expect(host.textContent).toContain(" · Owner not reachable");
    expect(host.textContent).not.toMatch(/Approve|Not yet|Decide/);
    expect(host.querySelector("input")).toBeNull();
  });

  it("lists an owner_unreachable row under Waiting on owners", async () => {
    const host = await render(queue([item({ id: "owner-reach:1", kind: "owner_unreachable", title: "Owner not reachable: Harbor Dental",
      label: "No owner email on record", href: `/workspace?workspaceId=${AGENCY}&agencyView=clients#owner-${CLIENT}` })]));
    expect(host.textContent).toContain("Waiting on owners");
    expect(host.textContent).toContain("Owner not reachable: Harbor Dental");
    expect(host.textContent).toContain("Harbor Dental · No owner email on record");
  });

  it("renders as today when an item has no lapse time", async () => {
    const host = await render(queue([item({})]));
    expect(host.textContent).not.toContain("Lapses");
    expect(host.textContent).not.toContain("Owner not reachable");
  });
});
