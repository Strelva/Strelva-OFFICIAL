// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessHome } from "@/experience/workspace/BusinessHome";
import { NeedsYouSection, StrelvaHandledSection } from "@/experience/workspace/NeedsYouSection";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { NeedsYouState } from "@/experience/workspace/useNeedsYou";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
const workspaceId = "a0000000-0000-4000-8000-000000000001";
const noop = () => undefined;
const ask: OwnerDecision = {
  id: "d0000000-0000-4000-8000-000000000001", workspaceId, systemId: null, kind: "customer.commitment", route: "owner_decides",
  title: "Review the fictional consultation reply", detail: "The consultation is $150.", approveEffect: "The reply sends.", notYetEffect: "Nothing sends.",
  sourceLifecycle: "tenant_event", sourceId: "fictional:reply", revisionHash: "a".repeat(64), urgent: true, signInRequired: false, adminMayDecide: true,
  openHref: "/workspace/inquiries", state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
  deliveryState: "suppressed", operatorNote: null, openedAt: "2026-10-09T11:00:00Z", expiresAt: "2026-10-20T11:00:00Z",
  reminded1At: null, reminded2At: null, deliveries: [], review: ["Complete fictional reply."],
};
type Ready = Extract<NeedsYouState, { status: "ready" }>;
const ready = (over: Partial<Ready> = {}): Ready => ({ status: "ready", role: "owner", items: [], complete: false, handled: [], handledAvailable: true, ...over });
let root: Root | undefined;
let node: HTMLDivElement;
async function mount(child: ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(child));
}
afterEach(async () => { await act(async () => root?.unmount()); node?.remove(); root = undefined; vi.unstubAllGlobals(); });
const text = () => node.textContent ?? "";
const button = (name: string) => [...node.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name);
const click = async (name: string) => { expect(button(name)).toBeDefined(); await act(async () => button(name)!.click()); };

async function home(responses: (Ready | { error: string })[], view: "home" | "needs-you" = "home", work: WorkspaceWork[] = []) {
  let reads = 0;
  const request = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/workspace/needs-you") {
      const response = responses[Math.min(reads++, responses.length - 1)]!;
      if ("error" in response) return Response.json(response, { status: 503 });
      const { status: _status, ...body } = response;
      return Response.json(body);
    }
    if (url.pathname === "/api/service-requests") return Response.json({ requests: [] });
    return Response.json({ error: "Unrelated fictional read unavailable." }, { status: 503 });
  });
  vi.stubGlobal("fetch", request);
  const snapshot: WorkspaceSnapshot = {
    actor: { email: "owner@fictional.example", localPreview: true },
    workspaces: [{ id: workspaceId, kind: "customer", name: "Fictional Workshop", role: "role" in responses[0]! ? responses[0].role : "owner" }],
    workspaceId, work, handoffs: [], delegations: [], products: [], releases: { systems: false, needsYou: true },
  };
  const onNavigate = vi.fn();
  await mount(<WorkspaceRequestContext.Provider value={request}><BusinessHome snapshot={snapshot} sites={[]} unassignedSites={[]} siteAssignmentsKnown
    offerings={{ status: "unavailable", reason: "Fictional fixture." }} busy={false} onOpen={noop} onStart={noop} onRequest={noop}
    onNavigate={onNavigate} onWorkspace={noop} onOfferings={noop} accountHref="/workspace/account" view={view} /></WorkspaceRequestContext.Provider>);
  return { request, onNavigate };
}
function assertNoClear() { expect(text()).not.toMatch(/Nothing needs you|Nothing is waiting on you/); }

describe("actual Needs-you reads on Home and its decision place", () => {
  it.each(["home", "needs-you"] as const)("keeps incomplete empty %s honest until a complete retry read", async view => {
    const { request, onNavigate } = await home([ready(), ready({ complete: true })], view);
    expect(text()).toContain("Some decisions could not be checked."); assertNoClear();
    if (view === "needs-you") expect(text()).toContain("Decisions only you can make for Fictional Workshop.");
    await click("Check again");
    expect(text()).toContain(view === "home" ? "Nothing needs you right now." : "Nothing needs you.");
    expect(text()).not.toContain("Some decisions could not be checked.");
    if (view === "needs-you") expect(text()).toContain("Nothing is waiting on you.");
    const reads = request.mock.calls.filter(([url]) => String(url).startsWith("/api/workspace/needs-you"));
    expect(reads).toHaveLength(2);
    for (const [url, init] of reads) {
      expect(String(url)).toBe(`/api/workspace/needs-you?workspaceId=${workspaceId}`);
      expect(init?.cache).toBe("no-store"); expect(init?.method ?? "GET").toBe("GET");
    }
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it("keeps known decisions and saved-work asks during a partial read and only totals a complete read", async () => {
    const work: WorkspaceWork = { id: "fictional-work", workspaceId, title: "Review the opening checklist", productId: "documents", resourceKind: "document", payload: null,
      input: {}, createdAt: "2026-10-09T11:00:00Z", operation: { status: "needs_attention", reason: "Review the proposed change." } };
    await home([ready({ items: [ask] }), ready({ items: [ask], complete: true })], "needs-you", [work]);
    expect(text()).toContain("Some decisions could not be checked.");
    expect(button(`Approve: ${ask.title}`)).toBeDefined(); expect(button("Open Review the opening checklist")).toBeDefined();
    expect(text()).toContain("Decisions only you can make for Fictional Workshop."); assertNoClear();
    await click("Check again"); expect(text()).toContain("Two decisions only you can make.");
    expect(button(`Approve: ${ask.title}`)).toBeDefined();
  });
  it("retains the member boundary on an actual incomplete read", async () => {
    await home([ready({ items: [ask], role: "member" })], "needs-you");
    expect(text()).toContain("Some decisions could not be checked.");
    expect(text()).toContain("Only the owner can decide these. You can see what is waiting.");
    expect(button(`Approve: ${ask.title}`)).toBeUndefined(); expect(button(`Not yet: ${ask.title}`)).toBeUndefined();
    expect([...node.querySelectorAll("a")].some(a => a.textContent?.trim() === "Open")).toBe(true);
  });
});
describe("partial discovery preserves independent decisions and receipts", () => {
  it("does not disappear without an empty-state caller", async () => {
    await mount(<NeedsYouSection state={ready()} pending={null} notices={{}} onDecide={noop} onRetry={noop} />);
    expect(node.querySelector('[role="status"]')?.textContent).toContain("Some decisions could not be checked.");
    expect(button("Check again")).toBeDefined();
  });
  it("keeps pending and missing-review guards while showing known partial asks", async () => {
    await mount(<NeedsYouSection state={ready({ items: [ask, { ...ask, id: "d0000000-0000-4000-8000-000000000002", title: "Review unavailable change", review: null }] })}
      pending={ask.id} notices={{}} onDecide={noop} onRetry={noop} />);
    expect(button(`Approve: ${ask.title}`)?.disabled).toBe(true); expect(button(`Not yet: ${ask.title}`)?.disabled).toBe(true);
    expect(button("Approve: Review unavailable change")).toBeUndefined(); expect(text()).toContain("Refresh to see the latest before deciding.");
  });
  it.each([true, false])("does not conflate partial discovery with handledAvailable=%s", async handledAvailable => {
    await home([ready({ handledAvailable })]); expect(text()).toContain("Some decisions could not be checked.");
    const section = node.querySelector('[aria-labelledby="home-handled"]')!;
    expect(section.textContent).toContain(handledAvailable ? "Nothing this week." : "This week’s changes could not be loaded.");
  });
  it("still hides a complete empty caller-less queue while separately showing handled availability", async () => {
    await mount(<><NeedsYouSection state={ready({ complete: true })} pending={null} notices={{}} onDecide={noop} onRetry={noop} />
      <StrelvaHandledSection state={ready({ complete: true })} pending={null} notices={{}} onUndo={noop} /></>);
    expect(node.querySelector('[aria-labelledby="home-attention"]')).toBeNull(); expect(text()).toContain("Nothing this week.");
  });
});


describe("initiated retry focus across actual partial and failed reads", () => {
  it.each(["home", "needs-you"] as const)("recovers keyboard focus through partial→error→complete in %s", async view => {
    await home([ready(), { error: "Fictional discovery unavailable." }, ready({ complete: true })], view);
    const initial = button("Check again")!; initial.focus(); await click("Check again");
    const failed = button("Check again")!;
    expect(initial.isConnected).toBe(false); expect(document.activeElement).toBe(failed); assertNoClear();
    expect(text()).toContain("Your decisions could not be checked. Nothing about them changed.");
    await click("Check again");
    expect(failed.isConnected).toBe(false);
    expect(document.activeElement).toBe(node.querySelector(view === "home" ? "#home-attention" : "h1"));
    expect(text()).toContain(view === "home" ? "Nothing needs you right now." : "Nothing needs you.");
  });
  it.each(["home", "needs-you"] as const)("preserves outside movement across partial→error→complete in %s", async view => {
    await home([ready(), { error: "Fictional discovery unavailable." }, ready({ complete: true })], view);
    const outside = node.querySelector<HTMLSelectElement>('select[aria-label="Current workspace"]')!;
    outside.focus(); await click("Check again"); expect(document.activeElement).toBe(outside); assertNoClear();
    await click("Check again"); expect(document.activeElement).toBe(outside);
    expect(text()).toContain(view === "home" ? "Nothing needs you right now." : "Nothing needs you.");
  });
});
