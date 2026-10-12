// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyNativePage } from "@/experience/workspace/agency/AgencyNativePage";
const workspaceId = "61000000-0000-4000-8000-000000000003";
const workId = "61000000-0000-4000-8000-000000000004";
const choices = { workspaceId, choices: [{ workId, title: "Harbor Dental", expectedRevision: 3, candidateRevision: 2, candidateContentHash: "a".repeat(64), inquiry: true, booking: true }] };
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(request: typeof fetch, kind: "form" | "booking" = "form") {
  const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(AgencyNativePage, { request, workspaceId, businessName: "Harbor Dental", url: "/api/workspace/agency-authoring?agencyWorkspaceId=agency", kind })));
  return node;
}
function button(node: HTMLElement, text: string) { return [...node.querySelectorAll("button")].find(item => item.textContent === text)!; }
it("reviews a native form then sends to the named business, retaining the same command after an uncertain outcome", async () => {
  const request = vi.fn().mockResolvedValueOnce(Response.json(choices)).mockRejectedValueOnce(new Error("Lost reply"));
  const node = await render(request);
  const site = node.querySelector("select")!;
  await act(async () => { site.value = workId; site.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button(node, "Send to Harbor Dental")).toBeUndefined();
  await act(async () => button(node, "Review draft").click());
  expect(node.textContent).toContain("Release 3 draft");
  await act(async () => button(node, "Send to Harbor Dental").click());
  const firstBody = request.mock.calls[1]?.[1]?.body;
  expect(firstBody).toBeTypeOf("string");
  expect(node.textContent).toContain("same command is retained");
  request.mockImplementationOnce((_url: unknown, init: RequestInit) => {
    const command = JSON.parse(String(init.body));
    return Promise.resolve(Response.json({ workspaceId, workId, commandId: command.commandId, candidateRevision: 3, actor: { kind: "agency", displayName: "Page Studio" }, contentHash: "b".repeat(64), previewHref: `/api/websites/${workId}/preview` }));
  });
  await act(async () => button(node, "Retry sending to Harbor Dental").click());
  expect(request.mock.calls[2]?.[1]?.body).toBe(firstBody);
  expect(node.textContent).toContain("Sent to Harbor Dental for website review");
  expect(node.textContent).toContain("no notification was sent");
});
it("names an absent connection instead of offering a send", async () => {
  const node = await render(vi.fn().mockResolvedValue(Response.json({ workspaceId, choices: [] })), "booking");
  expect(node.textContent).toContain("No connected booking service is available");
  expect(button(node, "Send to Harbor Dental")).toBeUndefined();
});
it("preserves connection read failures with Refresh", async () => {
  const request = vi.fn().mockRejectedValue(new Error("Read unavailable")); const node = await render(request);
  expect(node.textContent).toContain("Read unavailable");
  expect(button(node, "Refresh connections")).toBeDefined();
  expect(node.textContent).not.toContain("No connected form is available");
});
