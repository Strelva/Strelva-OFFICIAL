// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyTeamView } from "@/experience/workspace/agency/AgencyTeamView";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { TEAM_AGENCY, TEAM_CLIENT, TEAM_STAFF, withAgencyTeamPreview } from "@/experience/workspace/preview/agency-team-fixture";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(state = "ready", transport?: typeof fetch) {
  const request = vi.fn(transport ?? withAgencyTeamPreview(async () => Response.json({}), state));
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(AgencyTeamView, { workspaceId: TEAM_AGENCY }))));
  return { node, request };
}
const button = (node: HTMLElement, name: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.trim() === name)!;
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const writes = (request: ReturnType<typeof vi.fn>) => request.mock.calls.filter(call => call[1]?.method === "POST").map(call => JSON.parse(String(call[1]?.body)));

it("shows actual staffed clients, role controls, and protected owner/self memberships", async () => {
  const { node } = await render();
  expect(node.textContent).toContain("Client operator: The Mooney Firm");
  expect(node.querySelectorAll("select")).toHaveLength(3);
  expect(node.querySelectorAll('[aria-label="Agency team"] button')).toHaveLength(2);
  expect(node.textContent).toContain("No assigned clients");
});
it("keeps members read only with no invitation or assignment controls", async () => {
  const { node } = await render("member");
  expect(node.textContent).toContain("Only agency owners and admins");
  expect(node.querySelectorAll("input, select")).toHaveLength(0);
  expect(node.textContent).not.toContain("Remove staff");
});
it("renders loading, empty, forbidden/error and retry states", async () => {
  const loading = await render("loading"); expect(loading.node.textContent).toContain("Loading team");
  const empty = await render("empty"); expect(empty.node.textContent).toContain("No clients have an active agency seat");
  const failed = await render("permission"); expect(failed.node.querySelector('[role="alert"]')).toBeTruthy();
  await click(button(failed.node, "Retry team")); expect(failed.request).toHaveBeenCalledTimes(2);
});
it("assigns one member through the bulk RPC contract and refreshes confirmed state", async () => {
  const { node, request } = await render();
  const member = [...node.querySelectorAll('ul[aria-label="Agency team"] > li')].find(item => item.textContent?.includes("sam@agency.example.test"))!;
  const inputs = member.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await click(inputs[1]!);
  expect(writes(request)).toEqual([{ action: "assign", workspaceId: TEAM_AGENCY, userIds: [TEAM_STAFF], clientIds: ["f1000000-0000-4000-8000-000000000011"], active: true }]);
  expect(member.textContent).toContain("The Mooney Firm, Lake Bakery");
});
it("sends one bulk mutation for the selected people and clients", async () => {
  const { node, request } = await render();
  const bulk = node.querySelector("details")!;
  const boxes = bulk.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await click(boxes[1]!); await click(boxes[3]!); await click(boxes[4]!);
  await click(button(node, "Assign selected"));
  expect(writes(request)).toEqual([{ action: "assign", workspaceId: TEAM_AGENCY, userIds: [TEAM_STAFF], clientIds: [TEAM_CLIENT, "f1000000-0000-4000-8000-000000000011"], active: true }]);
});
it("requires explicit removal confirmation and removes the person after success", async () => {
  const { node, request } = await render();
  await click(button(node, "Remove staff")); expect(writes(request)).toHaveLength(0);
  expect(node.textContent).toContain("All their client assignments will end");
  await click(button(node, "Cancel removal")); expect(writes(request)).toHaveLength(0);
  await click(button(node, "Remove staff")); await click(button(node, "Confirm removal"));
  expect(writes(request)[0]).toEqual({ action: "remove", workspaceId: TEAM_AGENCY, userId: TEAM_STAFF });
  expect(node.textContent).not.toContain("sam@agency.example.test");
});
it("requires reload after an unconfirmed write and suppresses repeat mutations", async () => {
  const { node, request } = await render("action-error");
  const bulk = node.querySelector("details")!; const boxes = bulk.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await click(boxes[1]!); await click(boxes[3]!); await click(button(node, "Assign selected"));
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("Reload before making another change");
  expect(button(node, "Assign selected").disabled).toBe(true);
  await click(button(node, "Assign selected")); expect(writes(request)).toHaveLength(1);
  await click(button(node, "Reload team")); expect(button(node, "Assign selected").disabled).toBe(false);
});
it("blocks other-agency and malformed team responses", async () => {
  const { node } = await render("ready", async () => Response.json({ agencyWorkspaceId: TEAM_CLIENT }));
  expect(node.textContent).toContain("Team could not be loaded");
  expect(node.querySelector("form")).toBeNull();
});
it("creates an invitation link, lists its pending state and revokes it", async () => {
  const { node, request } = await render();
  await input(node.querySelector<HTMLInputElement>('input[type="email"]')!, "new.staff@example.test");
  await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(writes(request)[0]).toEqual({ action: "invite", workspaceId: TEAM_AGENCY, recipientEmail: "new.staff@example.test", role: "member" });
  expect(node.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("/workspace/invitations/accept/");
  expect(node.querySelector('[aria-label="Pending invitations"]')?.textContent).toContain("new.staff@example.test");
  await click(button(node, "Revoke invitation"));
  expect(node.querySelector('[aria-label="Pending invitations"]')).toBeNull();
});
it("distinguishes a confirmed write from a failed refresh and keeps the invitation link", async () => {
  const base = withAgencyTeamPreview(async () => Response.json({}));
  let reads = 0;
  const { node } = await render("ready", async (url, init) => {
    if (init?.method !== "POST" && ++reads > 1) return Response.json({ error: "Read unavailable" }, { status: 503 });
    return base(url, init);
  });
  await input(node.querySelector<HTMLInputElement>('input[type="email"]')!, "new.staff@example.test");
  await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("The change was confirmed, but the updated team could not be loaded");
  expect(node.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("/workspace/invitations/accept/");
  expect(button(node, "Create invitation").disabled).toBe(true);
});
