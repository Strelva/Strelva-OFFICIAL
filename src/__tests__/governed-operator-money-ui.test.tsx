// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorMoney } from "@/experience/workspace/money/OperatorMoney";
import type { GovernedOperatorGraph } from "@/platform/connect/governed-money-contract";
const workspaceId = "11111111-1111-4111-8111-111111111111", actorId = "22222222-2222-4222-8222-222222222222", payoutId = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
const graph: GovernedOperatorGraph = { workspaceId, agreements: [], prices: [], payouts: [{ id: payoutId, amountCents: 1700, currency: "cad", sourceAccountId: "platform", sourceTransaction: "ch_FictionalSource", recipientAccountId: "acct_FictionalRecipient", agreementVersion: "Explicit written agreement", profileVersion: "explicit-profile", recipientProfileVersion: "explicit-profile", authorizationProfileVersion: "explicit-profile", authorizedBy: actorId, transferId: null }] };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status }), roots: ReturnType<typeof createRoot>[] = [];
async function mount(request = vi.fn<typeof fetch>().mockResolvedValue(reply(graph)), profileVersion: string | null = "explicit-profile", executionEnabled = false) { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); await act(async () => root.render(createElement(OperatorMoney, { graph, actorId, profileVersion, executionEnabled, request }))); return { node, root, request }; }
async function click(node: HTMLElement, text: string) { const button = [...node.querySelectorAll("button")].find(item => item.textContent === text)!; await act(async () => button.click()); }
async function change(field: HTMLInputElement | HTMLSelectElement, value: string) { const setter = Object.getOwnPropertyDescriptor(field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!; await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }); }
async function fill(node: HTMLElement, mode = "price") { await change(node.querySelector("select")!, mode); for (const [name, value] of Object.entries(mode === "price" ? { version: "Written price", amountCents: "1700", currency: "cad", effectiveFrom: "2099-01-01T10:00" } : { version: "Written agreement", rateReference: "Written rate", effectiveFrom: "2099-01-01T10:00" })) await change(node.querySelector<HTMLInputElement>(`input[name=${name}]`)!, value); if (mode === "agreement") await change(node.querySelector<HTMLSelectElement>('select[name=kind]')!, "creator"); }
async function submit(node: HTMLElement) { await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
describe("recorded operator money", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  it("has no selected commercial amount/rate and hides dispatch without enabled execution or profile", async () => {
    const { node } = await mount(); expect(node.querySelector("form")).toBeNull(); expect(node.textContent).not.toContain("Send this approved payout"); expect(node.textContent).toContain("Payout execution is disabled");
    const missing = await mount(undefined, null, true); expect(missing.node.textContent).toContain("fee and liability profile is not configured"); expect(missing.node.textContent).not.toContain("Authorize this payout for");
  });
  it("requires an explicit rate and never turns an empty field into zero", async () => {
    const { node, request } = await mount(); await fill(node, "agreement"); await submit(node); expect(request).not.toHaveBeenCalled(); expect(node.querySelector("[role=alert]")?.textContent).toContain("exact written terms");
  });
  it("records only exact operator-entered terms and correlates actual actor acknowledgment", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => { const command = JSON.parse(String(init!.body)); return reply({ action: command.action, command, recordedBy: actorId, replayed: false }); }); const { node } = await mount(request); await fill(node); await submit(node);
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toMatchObject({ action: "record_price", amountCents: 1700, currency: "cad", definitionId: null }); expect(node.textContent).toContain("exact written configuration is recorded"); expect(node.querySelector("input")!.disabled).toBe(true);
  });
  it("refuses another actor's configuration receipt and preserves exact retry", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => { if (init?.method !== "POST") return reply(graph); const command = JSON.parse(String(init.body)); return reply({ action: command.action, command, recordedBy: other, replayed: false }); }); const { node } = await mount(request); await fill(node); await submit(node); const body = request.mock.calls[0]![1]!.body; expect(node.querySelector("[role=alert]")).not.toBeNull(); await click(node, "Reload current money records"); await click(node, "Retry the exact configuration"); expect(request.mock.calls[2]![1]!.body).toBe(body);
  });
  it("keeps authorization separate from dispatch and does not supply amount or recipient", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(reply({ transferId: "tr_FictionalAccepted", payoutId, profileVersion: "explicit-profile", requestedBy: actorId })); const { node } = await mount(request, "explicit-profile", true); await click(node, "Send this approved payout"); expect(request.mock.calls[0]![0]).toBe("/api/admin/money-payouts"); expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toEqual({ payoutId, profileVersion: "explicit-profile" }); expect(node.textContent).toContain("transfer was accepted");
  });
  it("refuses a receipt for another payout, profile or requesting actor", async () => {
    for (const changed of [{ payoutId: other }, { profileVersion: "stale-profile" }, { requestedBy: other }]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(reply({ transferId: "tr_FictionalAccepted", payoutId, profileVersion: "explicit-profile", requestedBy: actorId, ...changed })); const { node } = await mount(request, "explicit-profile", true); await click(node, "Send this approved payout"); expect(node.querySelector("[role=alert]")).not.toBeNull(); expect(node.textContent).not.toContain("transfer was accepted");
    }
  });
  it("unknown payout readback with an accepted receipt never sends a second transfer", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ error: "Lost accepted response" }, 500)).mockResolvedValueOnce(reply({ ...graph, payouts: [{ ...graph.payouts[0]!, transferId: "tr_FictionalAccepted" }] })); const { node } = await mount(request, "explicit-profile", true); await click(node, "Send this approved payout"); await click(node, "Reload current money records"); expect(node.textContent).toContain("No new payout was requested"); expect(node.textContent).not.toContain("Retry the exact payout"); expect(request.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });
  it("shows stale recorded authorization separately and never treats a new recipient profile as approval", async () => {
    const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
    await act(async () => root.render(createElement(OperatorMoney, { graph: { ...graph, payouts: [{ ...graph.payouts[0]!, profileVersion: "new-profile", recipientProfileVersion: "new-profile", authorizationProfileVersion: "old-profile" }] }, actorId, profileVersion: "new-profile", executionEnabled: true })));
    expect(node.textContent).toContain("Recorded for old-profile"); expect(node.textContent).toContain("Current recipient profile: new-profile"); expect(node.textContent).not.toContain("Send this approved payout");
  });
  it("never confirms malformed transfer IDs or changed immutable payout readback", async () => {
    for (const changed of [{ transferId: "not-a-transfer" }, { amountCents: 1701 }, { currency: "usd" }, { sourceTransaction: "ch_Foreign" }, { recipientAccountId: "acct_Foreign" }, { agreementVersion: "foreign-agreement" }, { authorizationProfileVersion: "foreign-profile" }]) {
      const request = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ error: "Lost payout response" }, 500)).mockResolvedValueOnce(reply({ ...graph, payouts: [{ ...graph.payouts[0]!, transferId: "tr_FictionalAccepted", ...changed }] }));
      const { node } = await mount(request, "explicit-profile", true); await click(node, "Send this approved payout"); await click(node, "Reload current money records");
      expect(node.textContent).not.toContain("The accepted payout receipt is recorded"); expect(node.querySelector("[role=alert]")).not.toBeNull();
    }
  });
  it("preserves accepted historical readback when the mutable recipient profile changes later", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ error: "Lost payout response" }, 500)).mockResolvedValueOnce(reply({ ...graph, payouts: [{ ...graph.payouts[0]!, transferId: "tr_FictionalAccepted", profileVersion: "recipient-later-profile", recipientProfileVersion: "recipient-later-profile" }] }));
    const { node } = await mount(request, "explicit-profile", true); await click(node, "Send this approved payout"); await click(node, "Reload current money records"); expect(node.textContent).toContain("The accepted payout receipt is recorded"); expect(node.textContent).toContain("Recorded for explicit-profile"); expect(node.textContent).not.toContain("Send this approved payout");
  });
  it("withdraws stale controls on read refusal and rejects cross-workspace graphs", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ error: "Operator revoked" }, 403)).mockResolvedValueOnce(reply({ ...graph, workspaceId: other })); const { node } = await mount(request); await click(node, "Reload current money records"); expect(node.querySelector("[role=alert]")!.textContent).toContain("Operator revoked"); expect([...node.querySelectorAll("button")].filter(button => button.textContent?.startsWith("Authorize")).every(button => button.disabled)).toBe(true); await click(node, "Reload current money records"); expect(node.querySelector("[role=alert]")!.textContent).toContain("another workspace");
  });
});
