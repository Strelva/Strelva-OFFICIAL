// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyLibraryView } from "@/experience/workspace/agency/AgencyLibraryView";
import { withAgencyPreview } from "@/experience/workspace/preview/agency-fixture";

const agencyWorkspaceId = "11111111-1111-4111-8111-111111111111";
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
  it("sends only selected ready Versions and keeps conflicts and missing accounts skipped", async () => {
    const request = vi.fn(withAgencyPreview(vi.fn(async () => Response.json({}, { status: 404 })), "agency", "full"));
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
    expect(body.versionIds).not.toContain("v-intake-2");
    expect(body.versionIds).not.toContain("v-intake-4");
    expect(body.versionIds).not.toContain("v-intake-5");
    expect(node.querySelector('[aria-label="Review all results"]')?.textContent).toContain("Skipped. Needs a choice");
    expect(node.querySelector('[aria-label="Review all results"]')?.textContent).toContain("Skipped. Needs Google Calendar");
  });
  it("refuses two simultaneous submissions and keeps the selected source readable", async () => {
    const transport = withAgencyPreview(vi.fn(async () => Response.json({}, { status: 404 })), "agency", "full");
    let resolve!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(async (input, init) => init?.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : transport(input, init));
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
});
