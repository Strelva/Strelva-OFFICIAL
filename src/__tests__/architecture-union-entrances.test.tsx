// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { SystemPage } from "@/experience/systems/SystemPage";
import { readBusinessSystems } from "@/experience/systems/from-workspace";
import { parseRebuildView } from "@/experience/websites/rebuild-transport";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import { BUSINESS, WORK, SYSTEM, json, envelope, createOpenedWorkFixture } from "./fixtures/opened-work-composition";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams(window.location.search) }));
const OTHER = "61000000-0000-4000-8000-000000000099";
const entrances = ["workspace", "system"] as const;
type Entrance = typeof entrances[number];
let root: Root | undefined;
let node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.scrollTo = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
  sessionStorage.clear();
});
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; node?.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/");
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function button(label: string) { return [...node.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label); }
function tool() { return node.querySelector<HTMLElement>('section[aria-label="Website rebuild"]')!; }
function workspaceReads(request: ReturnType<typeof vi.fn<typeof fetch>>) {
  return request.mock.calls.filter(([input]) => new URL(String(input), "http://fictional.invalid").pathname === "/api/workspace").length;
}
function currentLocation(entrance: Entrance) { return `/workspace?workspaceId=${BUSINESS}&${entrance === "workspace" ? `view=websites&work=${WORK}` : `view=system&system=${SYSTEM}`}`; }
type Options = {
  command?: () => Promise<Response>;
  read?: (id: string) => Promise<Response>;
  supplemental?: (route: "history" | "domain") => Promise<Response>;
  workspace?: () => Promise<Response>;
};
async function mount(entrance: Entrance, options: Options = {}) {
  const command = vi.fn(options.command ?? (async () => json(envelope(WORK, 2))));
  const { state, request: base } = await createOpenedWorkFixture(command, options.read);
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input), "http://fictional.invalid").pathname;
    if (path === "/api/workspace" && options.workspace) return options.workspace();
    if (options.supplemental && (path.endsWith("/history") || path.endsWith("/domain"))) return options.supplemental(path.endsWith("/history") ? "history" : "domain");
    return base(input, init);
  });
  vi.stubGlobal("fetch", request);
  window.history.replaceState(null, "", currentLocation(entrance));
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(<WorkspaceApp request={request} />));
  return { state, request, command };
}
function foreignEnvelope(field: "workspaceId" | "workId", revision = 1) {
  const value = envelope(WORK, revision);
  const foreign = { ...value, [field]: OTHER, rebuild: { ...value.rebuild, title: "Foreign website that must never appear" } };
  // A valid contract envelope with the wrong owning identity, rather than a malformed payload.
  expect(parseRebuildView(foreign)).toMatchObject({ [field]: OTHER, revision });
  return foreign;
}

for (const entrance of entrances) {
  it.each(["workspaceId", "workId"] as const)(`${entrance} refuses an otherwise-valid initial V2 read with wrong %s`, async field => {
    const { command, request } = await mount(entrance, { read: async () => json(foreignEnvelope(field)) });
    expect(tool().textContent).toContain("The current saved website could not be confirmed");
    expect(node.textContent).not.toContain("Foreign website that must never appear");
    expect(button("Confirm")).toBeUndefined();
    expect(command).not.toHaveBeenCalled();
    expect(workspaceReads(request)).toBe(1);
    expect(window.location.search).toBe(currentLocation(entrance).slice("/workspace".length));
  });

  it.each(["workspaceId", "workId"] as const)(`${entrance} refuses an otherwise-valid saved V2 acknowledgement with wrong %s`, async field => {
    const { command, request } = await mount(entrance, { command: async () => json(foreignEnvelope(field, 2)) });
    const identity = tool();
    await act(async () => button("Confirm")!.click());
    expect(tool()).toBe(identity);
    expect(tool().textContent).toContain("The change could not be confirmed");
    expect(tool().textContent).toContain("2 decisions need you");
    expect(tool().textContent).not.toContain("Foreign website that must never appear");
    expect(tool().textContent).not.toContain("Fact confirmed in a new revision");
    expect(button("Confirm")!.disabled).toBe(true);
    expect(command).toHaveBeenCalledTimes(1);
    expect(workspaceReads(request)).toBe(1); // Refused acknowledgement cannot reach App's save refresh.
    expect(window.location.search).toBe(currentLocation(entrance).slice("/workspace".length));
    await act(async () => button("Confirm")!.click());
    expect(command).toHaveBeenCalledTimes(1);
  });

  it(`${entrance} keeps accepted revision 2 when a delayed supplemental reload returns revision 1`, async () => {
    const late = deferred<Response>();
    let reads = 0;
    const accepted = { ...envelope(WORK, 2), rebuild: { ...envelope(WORK, 2).rebuild, title: "Accepted revision two" } };
    const { command, request } = await mount(entrance, {
      command: async () => json(accepted),
      read: async () => ++reads === 1 ? json(envelope()) : late.promise,
    });
    const identity = tool();
    await act(async () => button("Confirm")!.click());
    expect(tool()).toBe(identity);
    expect(tool().textContent).toContain("Accepted revision two");
    expect(tool().textContent).toContain("1 decision needs you");
    await act(async () => button("Reload saved History")!.click());
    expect(reads).toBe(2);
    const stale = { ...envelope(), rebuild: { ...envelope().rebuild, title: "Obsolete revision one" } };
    expect(parseRebuildView(stale).revision).toBe(1);
    await act(async () => late.resolve(json(stale)));
    expect(tool()).toBe(identity);
    expect(tool().textContent).toContain("Accepted revision two");
    expect(tool().textContent).toContain("1 decision needs you");
    expect(tool().textContent).not.toContain("Obsolete revision one");
    expect(tool().textContent).toContain("Reload again to check what was saved");
    expect(command).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it.each(["history", "domain", "both"] as const)(`${entrance} keeps acceptance and further editing usable when optional %s reads fail`, async failure => {
    const published = envelope(WORK, 2);
    published.rebuild = websiteRebuildSchema.parse({ ...published.rebuild, status: "published", launch: {
      receipt: { status: "published", receiptId: "fictional-receipt", provider: "fictional", providerUrl: "https://example.test", evidence: "Closed fixture; no provider contacted.", artifactHash: "b".repeat(64), candidateRevision: 2, publishedAt: "2026-10-09T12:00:00Z" },
      readBack: { status: "pending", message: "Fixture only", checkedAt: "2026-10-09T12:00:00Z" },
    } });
    let current = envelope();
    const { command, request } = await mount(entrance, {
      command: async () => {
        if (current.rebuild.revision === 2) {
          const next = envelope(WORK, 3);
          next.rebuild.candidate!.document.facts.uncertain!.origin = "owner_confirmed";
          current = next;
        } else current = published;
        return json(current);
      },
      read: async () => json(current),
      supplemental: async route => failure === "both" || failure === route
        ? json({ error: "Optional evidence temporarily unavailable." }, 500)
        : route === "domain" ? json({ domain: null }) : json({ workspaceId: BUSINESS, workId: WORK, revisions: [], legacyArchives: [], legacyArchivesNextCursor: null, legacyArchivesUnavailable: false }),
    });
    const identity = tool();
    await act(async () => button("Confirm")!.click());
    expect(tool()).toBe(identity);
    expect(tool().textContent).toContain("Fact confirmed in a new revision");
    expect(tool().textContent).toContain("Your accepted website change remains saved");
    await act(async () => button("Reload saved History")!.click());
    expect(tool()).toBe(identity);
    expect(tool().textContent).toContain("Saved state refreshed");
    expect(tool().textContent).toContain("Your accepted website change remains saved");
    expect(tool().querySelector(':scope > [role="alert"]')).toBeNull();
    expect(button(failure === "domain" ? "Reload domain status" : "Reload saved History")).toBeDefined();
    expect(button("Reload current state")).toBeUndefined();
    expect(button("Confirm")!.disabled).toBe(false);
    expect(command).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.some(([input]) => String(input).includes("/domain?"))).toBe(true);
    expect(request.mock.calls.some(([input]) => String(input).includes("/history?"))).toBe(true);
    // A distinct second user action is admitted against revision 2, never an unknown replay.
    await act(async () => button("Confirm")!.click());
    const posts = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(String(posts[1]![1]!.body))).toMatchObject({ expectedRevision: 2 });
    expect(tool().textContent).toContain("Fact confirmed in a new revision");
    expect(tool().textContent).toContain("Revision 3");
  });
}

it("workspace role changes keep the tool and pending attempt but refuse the old authority acknowledgement", async () => {
  const refresh = deferred<Response>(), pending = deferred<Response>();
  let workspaceCount = 0, commands = 0;
  const options: Options = { command: async () => ++commands === 1 ? json(envelope(WORK, 2)) : pending.promise };
  const { state, request, command } = await mount("workspace", options);
  // The first accepted save refreshes the actual App snapshot; hold that GET while a second action starts.
  options.workspace = async () => ++workspaceCount === 1 ? refresh.promise : json(state);
  const identity = tool();
  await act(async () => button("Confirm")!.click());
  expect(workspaceCount).toBe(1);
  await act(async () => button("Confirm")!.click());
  expect(command).toHaveBeenCalledTimes(2);
  state.workspaces[0]!.role = "member";
  await act(async () => refresh.resolve(json(state)));
  expect(tool()).toBe(identity);
  expect(button("Confirm")!.disabled).toBe(true);
  expect(tool().textContent).toContain("1 decision needs you");
  await act(async () => pending.resolve(json(envelope(WORK, 3))));
  expect(tool()).toBe(identity);
  expect(tool().textContent).toContain("Access changed while saving");
  expect(tool().textContent).toContain("1 decision needs you");
  expect(button("Reload current state")).toBeDefined();
  await act(async () => button("Confirm")!.click());
  expect(command).toHaveBeenCalledTimes(2);
  expect(workspaceReads(request)).toBe(2);
});

it("the real System entrance retains work identity across changed role authority and rejects a stale pending acknowledgement", async () => {
  const pending = deferred<Response>();
  const command = vi.fn(() => pending.promise);
  const { state, request } = await createOpenedWorkFixture(command);
  vi.stubGlobal("fetch", request);
  const { systems } = readBusinessSystems({ snapshot: state, sites: [] });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  const onHome = vi.fn(), onAsk = vi.fn();
  async function renderRole(role: "owner" | "member") {
    state.workspaces[0]!.role = role;
    await act(async () => root!.render(<WorkspaceRequestContext.Provider value={request}><SystemPage system={systems[0]} systems={systems} workspaceId={BUSINESS} sources={state.work} readOnly={role === "member"} canMakeReal={role === "owner"} onHome={onHome} onAsk={onAsk} systemHref={id => `?system=${id}`} /></WorkspaceRequestContext.Provider>));
  }
  await renderRole("owner");
  const identity = tool();
  await act(async () => button("Confirm")!.click());
  await renderRole("member");
  expect(tool()).toBe(identity);
  expect(button("Confirm")!.disabled).toBe(true);
  await renderRole("owner");
  expect(tool()).toBe(identity);
  expect(button("Confirm")!.disabled).toBe(true); // Original admitted attempt still owns settlement.
  await act(async () => pending.resolve(json(envelope(WORK, 2))));
  expect(tool()).toBe(identity);
  expect(tool().textContent).toContain("Access changed while saving");
  expect(tool().textContent).toContain("2 decisions need you");
  expect(tool().textContent).not.toContain("Fact confirmed in a new revision");
  await act(async () => button("Confirm")!.click());
  expect(command).toHaveBeenCalledTimes(1);
  expect(onHome).not.toHaveBeenCalled(); expect(onAsk).not.toHaveBeenCalled();
});
