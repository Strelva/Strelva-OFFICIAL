// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyClientUsage } from "@/experience/workspace/agency/AgencyClientUsage";
import { AgencyUsageSummary } from "@/experience/workspace/agency/AgencyUsageSummary";
import { parseLimitCents } from "@/experience/workspace/agency/UsageControlsPanel";
import { aiUsageLine } from "@/platform/ai-controls/contracts";

const AGENCY = "26100000-0000-4000-8000-000000000020";
const WS = "26100000-0000-4000-8000-000000000010";
const controls = (over: Record<string, unknown> = {}) => ({ paused: false, monthlyCapCents: null, reviewAutoPost: "client_choice", revision: 2, setBy: null, changedAt: null, ...over });
const budget = (over: Record<string, unknown> = {}, c: Record<string, unknown> = {}) => ({ spentUsd: "1.23", reservedUsd: "0", since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z", capCents: null, subscribed: true, unknownCostCalls: 0, controls: controls(c), ...over });
const page = (canChange = true, b = budget()) => ({ agencyWorkspaceId: AGENCY, canChange, budgetEnforced: false, freeCapUsd: null, clients: [{ workspaceId: WS, name: "Harbor Dental", budget: b, linkedTenantIds: ["harbor"] }] });

let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const mount = (request: typeof fetch) => act(async () => root.render(createElement(AgencyClientUsage, { agencyWorkspaceId: AGENCY, workspaceId: WS, clientName: "Harbor Dental", request })));
const button = (text: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.includes(text));
const click = (text: string) => act(async () => { button(text)!.click(); });
async function type(label: string, value: string) {
  const input = [...node.querySelectorAll("input")].find(item => item.labels?.[0]?.textContent?.includes(label))!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("agency client usage", () => {
  it("renders nothing while usage controls are off", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "off" }, { status: 503 })));
    expect(node.innerHTML).toBe("");
  });

  it("says where Strelva work stands, who set a limit and who last changed it, with no dollar figure", async () => {
    const b = budget({ spentUsd: "23.4", reservedUsd: "0.8" }, { monthlyCapCents: 2500, setBy: { kind: "agency", agencyName: "North Studio" }, changedAt: "2026-10-12T15:00:00Z" });
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page(true, b))));
    const text = node.textContent!;
    expect(text).toContain("Strelva work for Harbor Dental is running. This month resets Nov 1.");
    expect(text).toContain("North Studio set a monthly limit.");
    expect(text).toContain("Last changed by North Studio on Oct 12, 2026");
    expect(text).not.toMatch(/\$/);
  });

  it("says when work stopped at the limit, without the amount", async () => {
    const b = budget({ spentUsd: "25" }, { monthlyCapCents: 2500, setBy: { kind: "agency", agencyName: "North Studio" } });
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page(true, b))));
    expect(node.textContent).toContain("Strelva work for Harbor Dental reached this month’s limit. It starts again Nov 1.");
    expect(node.textContent).not.toMatch(/\$/);
  });

  it("says the cost is unknown instead of guessing", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page(true, budget({ unknownCostCalls: 2 })))));
    expect(node.textContent).toContain("Some calls this period have no recorded cost. While a limit is set, Strelva work stays paused until Nov 1.");
  });

  it("gives a member no save control", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page(false))));
    expect(button("Save usage controls")).toBeUndefined();
    expect(node.textContent).toContain("Only agency owners and admins can change these.");
  });

  it("shows a retry when the read fails", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 500 })).mockResolvedValueOnce(Response.json(page()));
    await mount(request);
    expect(node.textContent).toContain("Usage for Harbor Dental could not be read. Nothing changed.");
    await click("Retry");
    expect(node.textContent).toContain("Strelva work for Harbor Dental is running.");
  });

  it("saves the exact body with the revision, and a blank limit sends null", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page())).mockResolvedValueOnce(Response.json(page(true, budget({}, { paused: true, revision: 3 }))));
    await mount(request);
    expect(button("Save usage controls")!.disabled).toBe(true);
    await click("Paused");
    await type("Reason for change", "Owner asked us to pause");
    await click("Save usage controls");
    const [url, init] = request.mock.calls[1]!;
    expect(url).toBe("/api/workspace/agency-ai-controls");
    expect(JSON.parse(String(init!.body))).toEqual({ agencyWorkspaceId: AGENCY, workspaceId: WS, paused: true, monthlyCapCents: null, reviewAutoPost: "client_choice", expectedRevision: 2, reason: "Owner asked us to pause" });
    expect(node.textContent).toContain("Strelva work for Harbor Dental is paused.");
    expect(node.textContent).toContain("Saved. Harbor Dental sees who changed this.");
  });

  it("shows the agency no limit field and keeps an existing limit when it saves", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page(true, budget({}, { monthlyCapCents: 1250 })))).mockResolvedValueOnce(Response.json(page(true, budget({}, { monthlyCapCents: 1250, paused: true, revision: 3 }))));
    await mount(request);
    expect([...node.querySelectorAll("input")].some(item => item.labels?.[0]?.textContent?.includes("Monthly usage limit"))).toBe(false);
    await click("Paused");
    await type("Reason for change", "Owner asked us to pause");
    await click("Save usage controls");
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toMatchObject({ paused: true, monthlyCapCents: 1250 });
  });

  it("explains a revision conflict", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page())).mockResolvedValueOnce(Response.json({ error: "conflict" }, { status: 409 }));
    await mount(request);
    await click("Held");
    await type("Reason for change", "Hold replies for now");
    await click("Save usage controls");
    expect(node.textContent).toContain("These controls changed since you opened them. Refresh, then save again.");
  });

  it("never says AI", async () => {
    const b = budget({ unknownCostCalls: 1 }, { paused: true, monthlyCapCents: 500, reviewAutoPost: "held", setBy: { kind: "agency", agencyName: "North Studio" }, changedAt: "2026-10-12T15:00:00Z" });
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page(true, b))));
    expect(node.textContent).not.toMatch(/\bAI\b/);
  });
});

describe("Strelva work across clients", () => {
  it("lazy-loads on open and lists only the exceptions, with no dollar figure", async () => {
    const second = { workspaceId: "26100000-0000-4000-8000-000000000011", name: "Elm Bakery", budget: budget({ spentUsd: "9.5" }, { paused: true }), linkedTenantIds: [] };
    const third = { workspaceId: "26100000-0000-4000-8000-000000000012", name: "Fieldwork Studio", budget: budget({ spentUsd: "5" }, { monthlyCapCents: 500 }), linkedTenantIds: [] };
    const body = { ...page(), clients: [page().clients[0]!, second, third] };
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await act(async () => root.render(createElement(AgencyUsageSummary, { agencyWorkspaceId: AGENCY, request })));
    expect(request).not.toHaveBeenCalled();
    const details = node.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(request).toHaveBeenCalledTimes(1);
    const text = node.textContent!;
    expect(text).toContain("Elm Bakery");
    expect(text).toContain("Paused");
    expect(text).toContain("Limit reached · starts again Nov 1");
    expect(text).not.toContain("Harbor Dental");
    expect(text).not.toMatch(/\$/);
  });

  it("renders nothing while controls are off", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 503 }));
    await act(async () => root.render(createElement(AgencyUsageSummary, { agencyWorkspaceId: AGENCY, request })));
    const details = node.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(node.innerHTML).toBe("");
  });
});

describe("limit parsing and the binding limit", () => {
  it("parses dollars to cents", () => {
    expect(parseLimitCents("")).toEqual({ cents: null });
    expect(parseLimitCents("12.50")).toEqual({ cents: 1250 });
    expect(parseLimitCents("25")).toEqual({ cents: 2500 });
    expect("error" in parseLimitCents("-1")).toBe(true);
    expect("error" in parseLimitCents("1e3")).toBe(true);
    expect("error" in parseLimitCents("100000.01")).toBe(true);
  });

  it("picks the lower of the agency limit and the plan limit, and ignores the plan limit when it is not enforced", () => {
    const client = { budget: budget({ capCents: 500 }, { monthlyCapCents: 2000, setBy: { kind: "agency", agencyName: "North Studio" } }) } as never;
    expect(aiUsageLine(client, { budgetEnforced: true, freeCapUsd: null })).toMatchObject({ limitUsd: 5, limitSource: "plan" });
    expect(aiUsageLine(client, { budgetEnforced: false, freeCapUsd: null })).toMatchObject({ limitUsd: 20, limitSource: "agency" });
  });
});
