// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebsiteRebuildSharing } from "@/experience/websites/WebsiteRebuildSharing";
import { fixtureRebuild, fixtureSiteDocument } from "@/experience/websites/rebuild-fixture";
import type { RebuildView } from "@/experience/websites/rebuild-transport";
import { AddedClient } from "@/experience/workspace/agency/AgencyAddClient";
import type { AddAgencyClientResult, AgencyClientListItem } from "@/products/agency-clients/contracts";
import { FirstClientHandoff } from "@/experience/workspace/agency/FirstClientHandoff";
import { renderToStaticMarkup } from "react-dom/server";

let root: Root | undefined;
let container: HTMLDivElement;
const expiresAt = () => new Date(Date.now() + 72 * 3600000).toISOString();
const createdAt = () => new Date(Date.now() - 1000).toISOString();
let handoffs: { id: string; sourceWorkId: string; recipientEmail: string; status: "pending" | "accepted" | "expired" | "revoked"; expiresAt: string; createdAt: string }[];

function reviewReceipt(record: RebuildView, contentHash = record.candidate!.contentHash) {
  const expires = expiresAt();
  const payload = btoa(JSON.stringify({ workspaceId: record.workspaceId, workId: record.workId, revision: record.candidate!.revision, contentHash, recipientEmail: "owner@example.com", expiresAt: Date.parse(expires) })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return { previewHref: `/api/websites/shared/${payload}.fixture-signature`, expiresAt: expires, recipientEmail: "owner@example.com" };
}

function responses(record: RebuildView, options: { claimUnavailable?: boolean; publishing?: boolean | null } = {}) {
  handoffs = [];
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") return Response.json({ error: "Not configured" }, { status: 500 });
    if (path.startsWith("/api/workspace?")) return options.claimUnavailable
      ? Response.json({ error: "Claim read unavailable" }, { status: 503 })
      : Response.json({ workspaceId: record.workspaceId, handoffs });
    if (path.startsWith("/api/agency-onboarding?")) return options.publishing === null
      ? Response.json({ error: "Verification read unavailable" }, { status: 503 })
      : Response.json({ onboarding: { agency: { id: record.workspaceId }, effects: [{ effect: "publish", verified: options.publishing ?? false }] } });
    throw new Error(`Unexpected test request: ${path}`);
  });
}
async function mount(record: RebuildView, readOnly = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(createElement(WebsiteRebuildSharing, { workId: record.workId, record, readOnly })); });
}
function button(name: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === name); }
async function email(value = "owner@example.com") {
  const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("first client handoff", () => {
  it("business-owned website uses the existing business claim and never proposes artifact transfer", async () => {
    const record = fixtureRebuild();
    const agencyWorkspaceId = "d2950000-0000-4000-8000-0000000000a2";
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith("/api/workspace?")) return Response.json({ workspaceId: record.workspaceId, handoffs: [], workspaces: [{ id: record.workspaceId, kind: "customer" }] });
      if (path.endsWith("/sharing")) return Response.json({ kind: "customer", workspaceId: record.workspaceId, workId: record.workId, agencyWorkspaceId, ownerClaimed: false, pendingClaim: null });
      if (path.startsWith("/api/agency-onboarding?")) return Response.json({ error: "Not an agency" }, { status: 403 });
      if (init?.method === "POST" && path === "/api/workspace/agency-clients") return Response.json({ ownerClaim: { claimId: "d2950000-0000-4000-8000-0000000000c1", customerWorkspaceId: record.workspaceId, workspaceName: record.title, recipientEmail: "owner@example.com", expiresAt: expiresAt(), createdAt: createdAt(), replacedPending: false, claimPath: `/workspace/claim/${"a".repeat(43)}`, delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false } } });
      throw new Error(path);
    });
    vi.stubGlobal("fetch", request); await mount(record); await email();
    expect(container.textContent).toContain("No agency artifact is transferred");
    await act(async () => button("Prepare business owner claim link")!.click());
    expect(request).toHaveBeenCalledWith("/api/workspace/agency-clients", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "owner_link", agencyWorkspaceId, customerWorkspaceId: record.workspaceId, ownerEmail: "owner@example.com" }) }));
    expect(request.mock.calls.some(([path]) => String(path).endsWith("/handoff"))).toBe(false);
    expect(container.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("/workspace/claim/");
  });
  it("verified publication of the already claimed business-owned website completes its actual Live step", async () => {
    const record = { ...fixtureRebuild(), approved: true, status: "published" as const, readBack: "verified" as const, publishedUrl: "https://client.example" };
    const request = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path.startsWith("/api/workspace?")) return Response.json({ workspaceId: record.workspaceId, handoffs: [], workspaces: [{ id: record.workspaceId, kind: "customer" }] });
      if (path.endsWith("/sharing")) return Response.json({ kind: "customer", workspaceId: record.workspaceId, workId: record.workId, agencyWorkspaceId: "d2950000-0000-4000-8000-0000000000a2", ownerClaimed: true, pendingClaim: null });
      return Response.json({ error: "Not an agency" }, { status: 403 });
    });
    vi.stubGlobal("fetch", request); await mount(record);
    expect(container.textContent).toContain("Live, with publication verified");
    expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(4);
    expect(button("Prepare business owner claim link")).toBeUndefined();
  });
  it.each([false, true])("received business publication must match the authorized destination identity (foreign=%s)", async foreign => {
    const record = { ...fixtureRebuild(), approved: true };
    const destinationWork = "d2950000-0000-4000-8000-0000000000d1", destinationBusiness = "d2950000-0000-4000-8000-0000000000b1";
    const request = responses(record);
    handoffs = [{ id: "accepted", sourceWorkId: record.workId, recipientEmail: "owner@example.com", status: "accepted", expiresAt: expiresAt(), createdAt: createdAt(), customerWorkspaceId: destinationBusiness, customerWorkId: destinationWork } as typeof handoffs[number]];
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (input, init) => String(input) === `/api/websites/${destinationWork}/rebuild` ? Response.json({ workId: destinationWork, workspaceId: foreign ? record.workspaceId : destinationBusiness, rebuild: {
      version: 2, revision: 1, title: "Client website", input: { requestId: "native-client-destination", url: "https://example.com" }, status: "published", stages: [], checkpoint: null, skippedPaths: [],
      candidate: { revision: 1, contentHash: record.candidate!.contentHash, document: fixtureSiteDocument, previewHref: `/api/websites/${destinationWork}/preview` }, approvedCandidateRevision: 1, tenantId: "fictional-client",
      launch: { receipt: { status: "published", receiptId: "receipt-client", provider: "fixture", providerUrl: "https://client.example", evidence: "Fictional verified publication", artifactHash: record.candidate!.contentHash, candidateRevision: 1, publishedAt: createdAt() }, readBack: { status: "verified", checkedAt: createdAt(), message: "Verified fictional document" } },
      lastError: null, createdBy: "owner", createdAt: createdAt(), history: [],
    } }) : original(input, init));
    vi.stubGlobal("fetch", request); await mount(record);
    if (foreign) { expect(container.textContent).not.toContain("Live, with publication verified"); expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(3); }
    else { expect(container.textContent).toContain("Live, with publication verified"); expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(4); expect(container.querySelector('a[href*="work=d2950000"]')).not.toBeNull(); }
  });
  it("has one named journey with no invented completed steps", () => {
    const html = renderToStaticMarkup(createElement(FirstClientHandoff, { status: "Ready to draft", detail: "Client added", draft: "pending", review: "pending", claim: "unverified", live: "pending", action: "Start draft" }));
    expect(html).toContain("First client handoff progress");
    expect(html).not.toContain('data-state="done"');
    expect(html).toContain("not yet confirmed");
  });

  it("reads saved work without new parent wiring and accepts database timezone offsets", async () => {
    const record = fixtureRebuild();
    const fallback = responses(record);
    handoffs = [{ id: "pending", sourceWorkId: record.workId, recipientEmail: "owner@example.com", status: "pending", expiresAt: expiresAt().replace("Z", "+00:00"), createdAt: createdAt().replace("Z", "+00:00") }];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => String(input).endsWith("/rebuild") ? Response.json({ workId: record.workId, workspaceId: record.workspaceId, rebuild: {
      version: 2, revision: record.revision, title: record.title, input: { requestId: "request-with-native-id", url: "https://example.com" }, status: "review_ready", stages: [], checkpoint: null, skippedPaths: [],
      candidate: { revision: record.candidate!.revision, contentHash: record.candidate!.contentHash, document: fixtureSiteDocument, previewHref: `/api/websites/${record.workId}/preview` },
      approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: "agency-owner", createdAt: createdAt(), history: [],
    } }) : fallback(input, init)));
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(WebsiteRebuildSharing, { workId: record.workId, readOnly: false })));
    expect(container.textContent).toContain("Waiting for the owner to accept");
    expect(container.textContent).not.toContain("Owner claim status could not be read");
    expect(button("Check owner acceptance")).toBeDefined();
  });

  it("returns to the exact draft instead of presenting review or ownership actions before a candidate exists", async () => {
    const record = { ...fixtureRebuild(), candidate: null, status: "building" as const };
    vi.stubGlobal("fetch", responses(record)); await mount(record);
    expect(container.textContent).toContain("Draft not ready");
    const draft = [...container.querySelectorAll("a")].find(item => item.textContent === "Open website draft");
    expect(draft?.getAttribute("href")).toBe(`/workspace?workspaceId=${record.workspaceId}&work=${record.workId}`);
    expect(button("Create private review link")).toBeUndefined();
  });

  it("rejects a supplied record for another work scope", async () => {
    const record = fixtureRebuild(); const request = responses(record); vi.stubGlobal("fetch", request);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(WebsiteRebuildSharing, { workId: "another-work", record, readOnly: false })));
    expect(container.textContent).toContain("Handoff status unavailable");
    expect(container.textContent).toContain("different handoff");
    expect(request).not.toHaveBeenCalled();
    expect(button("Create private review link")).toBeUndefined();
  });

  it("offers private review first, keeps its exact recipient and does not mark review approved after link creation", async () => {
    const record = fixtureRebuild();
    const request = responses(record);
    request.mockImplementationOnce(async () => Response.json({ workspaceId: record.workspaceId, handoffs: [] }));
    vi.stubGlobal("fetch", request);
    await mount(record);
    request.mockImplementation(async (input, init) => {
      if (init?.method === "POST") return Response.json(reviewReceipt(record));
      throw new Error(String(input));
    });
    await email();
    await act(async () => button("Create private review link")!.click());
    expect(button("Copy private review link")).toBeDefined();
    expect(container.textContent).toContain("No message was sent");
    expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("Review approved");
    expect(request).toHaveBeenLastCalledWith(`/api/websites/${record.workId}/share`, expect.objectContaining({ method: "POST", body: JSON.stringify({ recipientEmail: "owner@example.com", expiresInHours: 72 }) }));
  });

  it("refuses to copy a link that expires while this screen remains open", async () => {
    const record = fixtureRebuild(); const request = responses(record); vi.stubGlobal("fetch", request); await mount(record); await email();
    const receipt = reviewReceipt(record);
    request.mockImplementation(async () => Response.json(receipt));
    await act(async () => button("Create private review link")!.click());
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(receipt.expiresAt) + 1);
    await act(async () => button("Copy private review link")!.click());
    expect(container.textContent).toContain("This private link expired");
    expect(button("Copy private review link")).toBeUndefined();
    expect(container.querySelector('input[readonly]')).toBeNull();
  });

  it("prepares one ownership claim only after recorded review, then waits for acceptance", async () => {
    const record = { ...fixtureRebuild(), approved: true, status: "approved" as const };
    const request = responses(record, { publishing: true }); vi.stubGlobal("fetch", request);
    await mount(record); await email();
    const handoff = { id: "claim-1", sourceWorkId: record.workId, status: "pending" as const, recipientEmail: "owner@example.com", expiresAt: expiresAt(), createdAt: createdAt() };
    request.mockImplementation(async () => Response.json({ token: "a".repeat(43), handoff }));
    await act(async () => button("Prepare owner claim link")!.click());
    expect(container.textContent).toContain("Waiting for the owner to accept");
    expect(button("Copy owner claim link")).toBeDefined();
    expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(2);
    expect(button("Prepare owner claim link")).toBeUndefined();
    expect(container.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("/workspace#handoff=");
  });

  it("uses the latest saved owner claim and never treats accepted ownership as a live launch", async () => {
    const record = { ...fixtureRebuild(), approved: true };
    vi.stubGlobal("fetch", responses(record));
    handoffs = [
      { id: "old", sourceWorkId: record.workId, status: "pending", recipientEmail: "owner@example.com", expiresAt: expiresAt(), createdAt: new Date(Date.now() - 10000).toISOString() },
      { id: "current", sourceWorkId: record.workId, status: "accepted", recipientEmail: "owner@example.com", expiresAt: expiresAt(), createdAt: createdAt() },
    ];
    await mount(record);
    expect(container.textContent).toContain("Owner accepted the handoff");
    expect(container.textContent).toContain("this source does not prove the business copy is live");
    expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(3);
    expect(button("Prepare owner claim link")).toBeUndefined();
  });

  it.each(["pending", "failed"] as const)("does not call a recorded publication live while its read-back is %s", async readBack => {
    const record = { ...fixtureRebuild(), approved: true, status: "published" as const, readBack, publishedUrl: "https://example.com" };
    vi.stubGlobal("fetch", responses(record)); await mount(record);
    expect(container.textContent).toContain("Published · outcome not fully verified");
    expect(container.textContent).not.toContain("Live, with publication verified");
    expect(container.querySelector('[data-state="unverified"]')).not.toBeNull();
  });

  it("reports verified source publication without qualifying the first-client launch", async () => {
    const record = { ...fixtureRebuild(), approved: true, status: "published" as const, readBack: "verified" as const, publishedUrl: "https://example.com" };
    vi.stubGlobal("fetch", responses(record)); await mount(record);
    expect(container.textContent).toContain("Source website live · client launch unconfirmed");
    expect(container.textContent).toContain("does not confirm the owner’s business copy is live");
    expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(2);
  });

  it("keeps unknown claim and verification reads unknown and disables another claim", async () => {
    const record = { ...fixtureRebuild(), approved: true };
    vi.stubGlobal("fetch", responses(record, { claimUnavailable: true, publishing: null })); await mount(record);
    expect(container.textContent).toContain("publishing verification could not be confirmed");
    expect(container.textContent).toContain("Owner claim status could not be read");
    expect(button("Prepare owner claim link")).toBeUndefined();
    expect(button("Read current handoff status")).toBeDefined();
  });

  it("holds a lost ownership response rather than offering a duplicate proposal", async () => {
    const record = { ...fixtureRebuild(), approved: true };
    const request = responses(record); vi.stubGlobal("fetch", request); await mount(record); await email();
    request.mockRejectedValue(new TypeError("Network interrupted"));
    await act(async () => button("Prepare owner claim link")!.click());
    expect(container.textContent).toContain("Outcome not confirmed");
    expect(button("Prepare owner claim link")).toBeUndefined();
    expect(button("Read current handoff status")).toBeDefined();
  });

  it("preserves authority in read-only mode and does not expose mutable link creation", async () => {
    const record = fixtureRebuild();
    vi.stubGlobal("fetch", responses(record)); await mount(record, true);
    expect(button("Create private review link")?.disabled).toBe(true);
    expect(container.textContent).toContain("read-only access");
  });

  it("does not label a link for a newer candidate as the inspected draft", async () => {
    const record = fixtureRebuild(); const request = responses(record); vi.stubGlobal("fetch", request); await mount(record); await email();
    request.mockImplementation(async () => Response.json(reviewReceipt(record, "f".repeat(64))));
    await act(async () => button("Create private review link")!.click());
    expect(container.textContent).toContain("draft changed before its review link was created");
    expect(button("Copy private review link")).toBeUndefined();
  });

  it("refuses foreign private link URLs and never renders them", async () => {
    const record = fixtureRebuild(); const request = responses(record); vi.stubGlobal("fetch", request); await mount(record); await email();
    request.mockImplementation(async () => Response.json({ previewHref: "https://foreign.example/private", expiresAt: expiresAt(), recipientEmail: "owner@example.com" }));
    await act(async () => button("Create private review link")!.click());
    expect(container.textContent).toContain("private review address could not be confirmed");
    expect(container.textContent).not.toContain("https://foreign.example");
    expect(button("Copy private review link")).toBeUndefined();
  });
});


const addedResult: AddAgencyClientResult = {
  client: { additionId: "addition", agencyWorkspaceId: "agency", customerWorkspaceId: "business", name: "Northside Bakery", sourceKind: "url", sourceUrl: "https://example.com", prospectId: null, factsSeeded: 1, seatId: "seat", addedBy: "agency-owner", addedAt: "2026-10-12T10:00:00.000Z", replayed: false },
  scan: { status: "scanned", seeded: [], name: "Northside Bakery", message: null },
  ownerClaim: { claimId: "claim", customerWorkspaceId: "business", workspaceName: "Northside Bakery", recipientEmail: "owner@example.com", delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false }, expiresAt: expiresAt(), createdAt: createdAt(), replacedPending: false, claimPath: "/workspace/claim/private-token" },
  ownerClaimError: null,
  website: { rebuild: "/workspace/website?workspaceId=business", connect: "/workspace/connections?workspaceId=business", rebuildOpenToAgency: true },
  aiCheck: { status: "not_requested" },
};
function addedHtml(currentClient?: AgencyClientListItem, rebuildOpenToAgency = true) {
  return renderToStaticMarkup(createElement(AddedClient, { result: { ...addedResult, website: { ...addedResult.website, rebuildOpenToAgency } }, agencyWorkspaceId: "agency", agencyHref: "/workspace?workspaceId=agency", currentClient, onAnother: () => {}, onClaim: () => {} }));
}
describe("new agency client handoff", () => {
  it("leads with one draft action and does not claim an unread owner has not signed in", () => {
    const html = addedHtml();
    expect(html).toContain("connect the site they have");
    expect(html).toContain("start a website draft");
    expect(html).not.toContain("Owner has not claimed");
    expect(html).not.toContain("Owner not signed in yet");
    expect(html).not.toContain('data-state="done"');
  });
  it("reads accepted owner status from the current client and removes the old private claim link", () => {
    const html = addedHtml({ ...addedResult.client, ownerClaimed: true, seatActive: true, pendingClaim: null });
    expect(html).toContain("Its owner claimed it.");
    expect(html).toContain("The owner has accepted their claim");
    expect(html).not.toContain("private-token");
    expect(html).not.toContain("No message was sent");
    expect(html).not.toContain('data-state="done">Live');
  });
  it("offers owner claim when agency rebuilding is gated and keeps draft pending", () => {
    const html = addedHtml({ ...addedResult.client, ownerClaimed: false, seatActive: true, pendingClaim: null }, false);
    expect(html).toContain("Make owner link");
    expect(html).toContain("A website draft opens to your agency once owner@example.com claims Northside Bakery.");
    expect(html).not.toContain("start a website draft");
    expect(html).not.toContain('data-state="done"');
  });
  it("does not present an expired or replaced owner token as the next action", () => {
    const html = addedHtml({ ...addedResult.client, ownerClaimed: false, seatActive: true, pendingClaim: { claimId: "replacement", recipientEmail: "owner@example.com", expiresAt: expiresAt(), delivery: addedResult.ownerClaim!.delivery } }, false);
    expect(html).not.toContain("private-token");
    expect(html).toContain("The link shown earlier is no longer current");
    expect(html).toContain("Make a new link");
  });

});
