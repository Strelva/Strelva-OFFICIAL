// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyPayerRequests } from "@/experience/workspace/billing/AgencyPayerRequests";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); refresh.mockClear(); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
function host() { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); return { node, root }; }
const pending = { id: "proposal", workspaceId: "business", workspaceName: "Buffalo Business", successorKind: "agency", successorWorkspaceId: "serving-agency", successorWorkspaceName: "Cedar Studio", status: "pending", canRespond: true, proposerEmail: "owner@example.test" };
const snapshot = (transitions: unknown[]) => ({ transitions, current: null, pending: null, currentActorId: "agency-owner" });
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent === label)!;
// The one yes (XaYes) names the consequence: "Cover Buffalo Business". Its shortcut hint rides in the same button.
const accept = (node: HTMLElement) => [...node.querySelectorAll("button")].find(item => item.textContent?.startsWith("Cover "))!;

it("accepts a proposal addressed to this agency through the payer inbox without reading client access", async () => {
  const { node, root } = host();
  const request = vi.fn<typeof fetch>(async (_url, init) => Response.json(snapshot(init?.method === "POST" ? [{ ...pending, status: "accepted" }] : [pending, { ...pending, id: "other", successorWorkspaceId: "other-agency", workspaceName: "Other business" }])));
  await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", request })));
  expect(node.textContent).toContain("Buffalo Business"); expect(node.textContent).not.toContain("Other business");
  expect(request).toHaveBeenNthCalledWith(1, "/api/work-economics/payer-transition", expect.objectContaining({ cache: "no-store" }));
  await act(async () => accept(node).click());
  expect(JSON.parse(String(request.mock.calls[1]![1]?.body))).toEqual({ action: "accept", transitionId: "proposal" });
  expect(node.textContent).toContain("You now cover Strelva for"); expect(node.textContent).toContain("Owners ask from their own Plan and usage page"); expect(refresh).toHaveBeenCalledOnce();
  expect(request.mock.calls.every(([url]) => String(url) === "/api/work-economics/payer-transition")).toBe(true);
});
it("does not offer acceptance when the server denies response authority", async () => {
  const { node, root } = host(); const request = vi.fn<typeof fetch>(async () => Response.json(snapshot([{ ...pending, canRespond: false }])));
  await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", request })));
  expect(accept(node)).toBeUndefined();
});
it("rechecks the payer inbox after a lost response before allowing another decision", async () => {
  const { node, root } = host();
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(snapshot([pending]))).mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce(Response.json(snapshot([{ ...pending, status: "accepted" }])));
  await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", request })));
  await act(async () => accept(node).click());
  expect(request).toHaveBeenCalledTimes(3); expect(request.mock.calls[2]![1]?.method).toBeUndefined();
  expect(node.textContent).toContain("Strelva couldn't confirm your answer"); expect(accept(node)).toBeUndefined();
});
it("withholds mutations when the outcome and reread both fail", async () => {
  const { node, root } = host();
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(snapshot([pending]))).mockRejectedValue(new Error("offline"));
  await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", request })));
  await act(async () => accept(node).click());
  expect(node.textContent).toContain("Strelva couldn't confirm your answer"); expect(accept(node).disabled).toBe(true); expect(button(node, "Check again")).toBeTruthy();
});
it.each([{}, snapshot([]), snapshot([{ ...pending, successorWorkspaceId: "different-agency", status: "accepted" }]), snapshot([{ ...pending, workspaceId: "different-business", status: "accepted" }]), snapshot([pending]), snapshot([{ ...pending, status: "accepted" }, { ...pending, status: "rejected" }])])("does not claim acceptance from a malformed or conflicting response: %j", async response => {
  const { node, root } = host();
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(snapshot([pending]))).mockResolvedValueOnce(Response.json(response)).mockResolvedValueOnce(Response.json(snapshot([pending])));
  await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", request })));
  await act(async () => accept(node).click());
  expect(request).toHaveBeenCalledTimes(3); expect(node.textContent).toContain("Strelva couldn't confirm your answer"); expect(node.textContent).not.toContain("You now cover Strelva for"); expect(refresh).not.toHaveBeenCalled();
});
it("names the owner who asked, and falls back to the email only when no name is recorded", async () => {
  const { node, root } = host();
  const request = vi.fn<typeof fetch>(async () => Response.json(snapshot([{ ...pending, proposerName: "Dr. Amy Lin" }])));
  await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", agencyName: "Cedar Studio", request })));
  expect(node.textContent).toContain("Dr. Amy Lin asked Cedar Studio to cover Strelva for Buffalo Business from now on.");
  expect(node.textContent).not.toContain("owner@example.test");
  const fallback = host();
  await act(async () => fallback.root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", request: vi.fn<typeof fetch>(async () => Response.json(snapshot([pending]))) })));
  expect(fallback.node.textContent).toContain("owner@example.test asked your agency to cover Strelva");
});
it("gives one ask the yes at a time; the others wait behind Answer this one", async () => {
  const { node, root } = host();
  const second = { ...pending, id: "second", workspaceId: "business-2", workspaceName: "Second Business" };
  const request = vi.fn<typeof fetch>(async () => Response.json(snapshot([pending, second])));
  await act(async () => root.render(createElement(AgencyPayerRequests, { agencyWorkspaceId: "serving-agency", request })));
  expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
  expect(accept(node).textContent).toContain("Cover Buffalo Business");
  await act(async () => button(node, "Answer this one").click());
  expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
  expect(accept(node).textContent).toContain("Cover Second Business");
});
