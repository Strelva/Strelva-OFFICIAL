// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyLibraryView } from "@/experience/workspace/agency/AgencyLibraryView";
import type { AgencyLibrary } from "@/experience/workspace/agency-clients";

const agencyWorkspaceId = "11111111-1111-4111-8111-111111111111";
const sourceId = "33333333-3333-4333-8333-333333333333";
const clientId = "22222222-2222-4222-8222-222222222222";
function library(): AgencyLibrary {
  return { agencyWorkspaceId, reviewEnabled: true, sources: [{
    systemId: sourceId, workspaceId: agencyWorkspaceId, name: "Intake", hidden: false,
    revisions: [1, 2, 3].map(number => ({ number, label: null, summary: number === 3 ? "Unreviewed change" : "Reviewed change", publishedAt: "2026-10-12T00:00:00Z" })),
    versions: Array.from({ length: 7 }, (_, index) => ({
      versionId: `v-intake-${index + 1}`, workspaceId: clientId, clientName: `Business ${index + 1}`, systemId: sourceId, systemName: "Intake", context: { kind: "agency_client", label: `Business ${index + 1}` }, baselineRevision: 1, improvementRevision: 2, localChanges: index === 3 ? 1 : 0, currentRelease: 1,
      state: index === 3 ? "conflicts" : index === 4 ? "missing_accounts" : "ready", conflicts: index === 3 ? [{ path: "title", local: "Local title", upstream: "Updated title" }] : [], missingBindings: index === 4 ? ["google_calendar"] : [], declinedReason: null,
    })),
  }, { systemId: "44444444-4444-4444-8444-444444444444", workspaceId: agencyWorkspaceId, name: "Twin Trees website", hidden: false, revisions: [], versions: [{ versionId: "v-camillus", workspaceId: clientId, clientName: "Twin Trees", systemId: sourceId, systemName: "Camillus", context: { kind: "location", label: "Camillus" }, baselineRevision: 1, improvementRevision: null, currentRelease: 1, state: "up_to_date", conflicts: [], missingBindings: [], declinedReason: null }] }] };
}
function transport(): typeof fetch {
  const current = library();
  return async (input, init) => {
    if (String(input).startsWith("/api/workspace/agency-library")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const source = current.sources.find(item => item.systemId === body.sourceSystemId)!;
        return Response.json({ sourceSystemId: source.systemId, revision: body.revision, results: body.versionIds.map((id: string) => {
          const version = source.versions.find(item => item.versionId === id)!;
          version.state = "up_to_date"; version.baselineRevision = body.revision; version.improvementRevision = null;
          return { versionId: id, workspaceId: version.workspaceId, clientName: version.clientName, outcome: "prepared", detail: "Ready for owner review" };
        }) });
      }
      return Response.json(current);
    }
    return Response.json({}, { status: 404 });
  };
}
const roots: ReturnType<typeof createRoot>[] = [];
const button = (node: HTMLElement, text: string) => [...node.querySelectorAll("button")].find(item => item.textContent === text)!;
async function render(request: typeof fetch) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(AgencyLibraryView, { request, agencyWorkspaceId, onWorkspace: () => undefined })));
  return node;
}
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("agency Library ready Version selection", () => {
  it.each([false, undefined])("holds preparation and review links when review availability is %s", async reviewEnabled => {
    const current = library(); current.reviewEnabled = reviewEnabled;
    const request = vi.fn<typeof fetch>(async () => Response.json(current));
    const node = await render(request);
    expect(node.textContent).toContain("Owner reviews are paused");
    const prepare = button(node, "Prepare offers for 1 client") || [...node.querySelectorAll("button")].find(item => item.textContent?.startsWith("Prepare offers"));
    expect(prepare?.disabled).toBe(true);
    expect(node.querySelector('a[href*="version-review"]')).toBeNull();
    expect(request.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });
  it("sends only selected ready Versions and keeps conflicts and missing accounts skipped", async () => {
    const request = vi.fn(transport());
    const node = await render(request);
    await act(async () => button(node, "Review selection").click());
    const checkboxes = [...node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(7);
    expect(checkboxes.filter(item => item.disabled)).toHaveLength(2);
    expect(checkboxes.filter(item => item.checked)).toHaveLength(5);
    await act(async () => checkboxes.find(item => item.checked)!.click());
    await act(async () => button(node, "Prepare 4 offers").click());
    const writes = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    const body = JSON.parse(String(writes[0]![1]!.body));
    expect(body.versionIds).toHaveLength(4);
    expect(body.revision).toBe(2);
    expect(node.textContent).toContain("1 ready");
    expect(node.textContent).toContain("4 up to date");
    expect(node.textContent).not.toMatch(/\br[123]\b/);
    expect(node.textContent).toContain("Release 1 + 1 local change");
    expect(body.versionIds).not.toContain("v-intake-1");
    expect(body.versionIds).not.toContain("v-intake-4");
    expect(body.versionIds).not.toContain("v-intake-5");
    expect(node.querySelector('[aria-label="Review all results"]')?.textContent).toContain("Skipped. Needs a choice");
    expect(node.querySelector('[aria-label="Review all results"]')?.textContent).toContain("Skipped. Needs Google Calendar");
  });
  it("refuses two simultaneous submissions and keeps the selected source readable", async () => {
    const delegate = transport();
    let resolve!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(async (input, init) => init?.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : delegate(input, init));
    const node = await render(request);
    const review = [...node.querySelectorAll("button")].find(item => item.textContent?.startsWith("Prepare offers for"))!;
    await act(async () => { review.click(); review.click(); });
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    const sources = [...node.querySelectorAll<HTMLButtonElement>('[aria-label="Sources"] button')];
    await act(async () => sources[1]!.click());
    expect(node.textContent).toContain("Camillus");
    await act(async () => resolve(Response.json({ error: "Could not prepare this improvement" }, { status: 503 })));
    expect(node.textContent).toContain("Twin Trees website");
  });
  it("holds stale counts after a failed refresh, preserves the receipt, and recovers through Refresh Library", async () => {
    const delegate = transport(); let libraryReads = 0;
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).startsWith("/api/workspace/agency-library") && init?.method !== "POST" && ++libraryReads === 2) return Response.json({ error: "Unavailable" }, { status: 503 });
      return delegate(input, init);
    });
    const node = await render(request);
    await act(async () => button(node, "Prepare offers for 1 client").click());
    expect(node.textContent).toContain("5 prepared for Release 2");
    expect(node.textContent).toContain("Counts may be out of date");
    expect(button(node, "Prepare offers for 1 client").disabled).toBe(true);
    await act(async () => button(node, "Refresh Library").click());
    expect(node.textContent).not.toContain("Counts may be out of date");
    expect(node.textContent).toContain("5 up to date");
    expect(node.textContent).toContain("5 prepared for Release 2");
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("refreshes changed readiness without posting or losing the chosen source", async () => {
    const current = library();
    const request = vi.fn<typeof fetch>(async input => String(input).startsWith("/api/workspace/agency-library") ? Response.json(current) : Response.json({}, { status: 404 }));
    const node = await render(request);
    current.sources[0]!.versions[0]!.state = "up_to_date";
    current.sources[0]!.versions[0]!.improvementRevision = null;
    await act(async () => button(node, "Refresh Library").click());
    expect(node.textContent).toContain("4 ready");
    expect(node.textContent).toContain("1 up to date");
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("never prepares a ready row without its recorded exact offer", async () => {
    const current = library();
    for (const version of current.sources[0]!.versions) delete version.improvementRevision;
    const request = vi.fn<typeof fetch>(async input => String(input).startsWith("/api/workspace/agency-library") ? Response.json(current) : Response.json({}, { status: 404 }));
    const node = await render(request);
    expect(button(node, "Prepare offers for 0 clients").disabled).toBe(true);
    expect(node.textContent).toContain("No Version has a qualified release ready");
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("rereads adoption after a lost response before permitting another offer", async () => {
    const delegate = transport();
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const result = await delegate(input, init);
      if (init?.method === "POST") throw new Error("Response lost");
      return result;
    });
    const node = await render(request);
    await act(async () => button(node, "Prepare offers for 1 client").click());
    expect(node.textContent).toContain("Outcome not confirmed");
    expect(node.textContent).toContain("5 up to date");
    expect(button(node, "Prepare offers for 0 clients").disabled).toBe(true);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("groups selected offers by their exact qualified releases and retains completed receipts if a later response is lost", async () => {
    const current = library(); current.sources[0]!.versions[1]!.improvementRevision = 3;
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (!String(input).startsWith("/api/workspace/agency-library")) return Response.json({}, { status: 404 });
      if (init?.method !== "POST") return Response.json(current);
      const body = JSON.parse(String(init.body));
      if (body.revision === 3) throw new Error("Response lost for Release 3");
      return Response.json({ sourceSystemId: sourceId, revision: body.revision, results: body.versionIds.map((id: string) => {
        const version = current.sources[0]!.versions.find(item => item.versionId === id)!;
        version.state = "up_to_date"; version.baselineRevision = body.revision; version.improvementRevision = null;
        return { versionId: id, workspaceId: clientId, clientName: version.clientName, outcome: "prepared", detail: "Prepared" };
      }) });
    });
    const node = await render(request);
    await act(async () => button(node, "Prepare offers for 1 client").click());
    const writes = request.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init!.body)));
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ revision: 2, versionIds: ["v-intake-1", "v-intake-3", "v-intake-6", "v-intake-7"] });
    expect(writes[1]).toMatchObject({ revision: 3, versionIds: ["v-intake-2"] });
    expect(node.textContent).toContain("4 prepared for Release 2");
    expect(node.textContent).toContain("Outcome not confirmed");
    expect(node.textContent).toContain("1 ready");
  });

});

it("filters Library by the latest release's declared connections and keeps unknown sources explicit", async () => {
  const current = library();
  current.sources[0]!.revisions.forEach(revision => { revision.requiredConnections = [{ provider: "resend", access: "act", optional: false, purpose: "Notify the team." }]; });
  const request: typeof fetch = async () => Response.json(current);
  const node = await render(request);
  const select = node.querySelector<HTMLSelectElement>('[aria-label="Works with"]')!;
  await act(async () => { select.value = "resend"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(node.querySelector('[aria-label="Sources"]')!.textContent).toContain("Intake");
  expect(node.querySelector('[aria-label="Sources"]')!.textContent).not.toContain("Twin Trees website");
  expect(node.textContent).toContain("Some source Connections could not be checked");
  await act(async () => { select.value = "highlevel"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(node.textContent).toContain("No sources work with this connection yet");
  expect(node.querySelector('[aria-label="Sources"]')).toBeNull();
  await act(async () => { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(node.querySelector('[aria-label="Sources"]')!.textContent).toContain("Twin Trees website");
});

it("shows a permission state without source contents when Library read is forbidden", async () => {
  const request: typeof fetch = async () => Response.json({ error: "Forbidden" }, { status: 403 });
  const node = await render(request);
  expect(node.textContent).toContain("You do not have permission to open this Library");
  expect(node.querySelector('[aria-label="Sources"]')).toBeNull();
});
