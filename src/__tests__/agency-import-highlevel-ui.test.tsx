// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyImportClients } from "@/experience/workspace/agency/AgencyImportClients";

const agency = "22222222-2222-4222-8222-222222222222";
let root: Root, node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

function stubRead(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
}

describe("HighLevel on Import clients", () => {
  it("says HighLevel isn't set up and offers no Connect link when Strelva lacks the keys", async () => {
    stubRead({ connection: null, setup: { ready: false } });
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={agency} highLevel initialSource="highlevel" />));
    expect(node.textContent).toContain("HighLevel isn’t set up on Strelva yet. Paste rows or upload a file instead.");
    expect(node.textContent).not.toContain("Connect HighLevel");
    expect(node.querySelector('a[href*="gohighlevel/oauth"]')).toBeNull();
  });

  it("offers Connect HighLevel once the keys exist", async () => {
    stubRead({ connection: null, setup: { ready: true } });
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={agency} highLevel initialSource="highlevel" />));
    expect(node.querySelector('a[href*="gohighlevel/oauth"]')?.textContent).toBe("Connect HighLevel");
  });

  it("shows the outcome HighLevel's callback sent back", async () => {
    stubRead({ connection: null, setup: { ready: true } });
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={agency} highLevel initialSource="highlevel" initialError="HighLevel didn't finish connecting. Nothing changed." />));
    expect(node.textContent).toContain("HighLevel didn't finish connecting. Nothing changed.");
  });

  it("shows the connected notice", async () => {
    stubRead({ connection: { status: "connected" }, setup: { ready: true } });
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={agency} highLevel initialSource="highlevel" initialNotice="HighLevel is connected. Read your sub-accounts to preview them." />));
    expect(node.textContent).toContain("HighLevel is connected. Read your sub-accounts to preview them.");
    expect(node.textContent).toContain("Read sub-accounts");
  });
});
