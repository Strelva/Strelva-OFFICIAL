// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerDecisionPreview } from "@/experience/workspace/preview/OwnerDecisionPreview";
import { createOwnerDecisionTransport, ownerDecisionWorkspace, sessionDateDecision } from "@/experience/workspace/preview/owner-decision-fixture";

vi.mock("next/navigation", () => ({ usePathname: () => "/preview/strelva/owner-decision", useRouter: () => ({ push: vi.fn() }) }));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });
const read = `/api/workspace/needs-you?workspaceId=${ownerDecisionWorkspace}`;
const decide = (decision: string, revision = sessionDateDecision.revisionHash) => ({ method: "POST", body: JSON.stringify({ workspaceId: ownerDecisionWorkspace, itemId: sessionDateDecision.id, revision, decision }) });

describe("fictional owner decision transport", () => {
  it("accepts only a current item's explicit control and never falls through to a provider", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const transport = createOwnerDecisionTransport("ready");
    expect((await transport("/api/workspace/needs-you", decide("yes"))).status).toBe(400);
    expect((await transport("/api/workspace/needs-you", decide("approve", "stale"))).status).toBe(409);
    expect((await (await transport(read)).json()).items).toHaveLength(1);
    expect((await transport("/api/workspace/needs-you", decide("approve"))).status).toBe(200);
    expect((await (await transport(read)).json()).items).toHaveLength(0);
    expect((await transport("/api/provider", { method: "POST", body: JSON.stringify({ workspaceId: ownerDecisionWorkspace }) })).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("keeps member decisions and unknown business reads closed", async () => {
    const transport = createOwnerDecisionTransport("permission");
    expect((await transport("/api/workspace/needs-you", decide("approve"))).status).toBe(403);
    expect((await transport("/api/workspace/needs-you?workspaceId=other")).status).toBe(403);
    expect((await (await transport(read)).json()).role).toBe("member");
  });
  it("never retries an accepted fictional receipt by Undo", async () => {
    const transport = createOwnerDecisionTransport("ready");
    expect((await transport("/api/workspace/needs-you/undo", { method: "POST", body: JSON.stringify({ workspaceId: ownerDecisionWorkspace, receiptId: "fictional-reply" }) })).status).toBe(409);
  });
  it("typed yes leaves the decision open, and a plain click on Hold does not accept", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div"); document.body.append(node); const root = createRoot(node);
    cleanup = async () => { await act(async () => root.unmount()); node.remove(); };
    await act(async () => root.render(<OwnerDecisionPreview state="ready" dark={false} />));
    const input = node.querySelector<HTMLInputElement>('input[aria-label="Ask Strelva"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "yes"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.textContent).toContain("A typed yes changes nothing.");
    const hold = node.querySelector<HTMLButtonElement>('button[aria-label="Hold to make it live: Let attorneys request a session date"]')!;
    await act(async () => hold.click());
    expect(node.querySelector('button[aria-label="Confirm: Hold to make it live: Let attorneys request a session date"]')).not.toBeNull();
    expect(node.textContent).not.toContain("Nothing needs you.");
    const cancel = [...node.querySelectorAll("button")].find(button => button.textContent === "Cancel")!;
    await act(async () => cancel.click());
    const restored = node.querySelector<HTMLButtonElement>('button[aria-label="Hold to make it live: Let attorneys request a session date"]')!;
    expect(document.activeElement).toBe(restored);
    await act(async () => restored.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true })));
    expect(node.querySelector('button[aria-label="Hold to make it live: Let attorneys request a session date"]')).toBeNull();
    expect(node.textContent).toContain("Nothing needs you.");
  });
});
