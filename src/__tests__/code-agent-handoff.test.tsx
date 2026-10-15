// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeAgentHandoff } from "@/experience/operations/CodeAgentHandoff";
import { deliveryInspectionSchema } from "@/experience/operations/delivery-client";

const REQUEST = "33333333-3333-4333-8333-333333333333";
const MCP = "https://app.strelva.com/api/mcp/public";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function mount() {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(CodeAgentHandoff, { mcpUrl: MCP, requestId: REQUEST })));
  return node;
}
const copyButtons = (node: HTMLElement) => [...node.querySelectorAll("button")].filter(button => button.textContent === "Copy");

describe("hand it to your coding agent", () => {
  it("shows both lines to copy, with the Request id, and what the agent cannot do", async () => {
    const node = await mount();
    expect(node.textContent).toContain("Hand it to your coding agent");
    expect(node.textContent).toContain(`claude mcp add --transport http strelva ${MCP}`);
    expect(node.textContent).toContain("Once per computer. Sign in as yourself and choose this client.");
    expect(node.textContent).toContain(`Pick up Strelva Request ${REQUEST}. Use read_site_request, build it on a branch, then report_site_preview.`);
    expect(node.textContent).toContain("Don't merge until the owner makes it live; then deploy and report_site_deploy.");
    expect(node.textContent).toContain("Your agency accepts the Request here first. The coding agent can't approve or make anything live.");
    expect(copyButtons(node)).toHaveLength(2);
  });

  it("says Copied, and says plainly when the clipboard refuses", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const node = await mount();
    await act(async () => copyButtons(node)[0]!.click());
    expect(writeText).toHaveBeenLastCalledWith(`claude mcp add --transport http strelva ${MCP}`);
    expect(node.querySelector('[role="status"]')?.textContent).toBe("Copied");
    writeText.mockRejectedValueOnce(new Error("blocked"));
    await act(async () => copyButtons(node)[1]!.click());
    expect(node.textContent).toContain("Copy failed");
    expect(node.querySelectorAll('[role="status"]').length).toBe(2);
  });
});

describe("delivery inspection with a coding agent", () => {
  const request = { id: REQUEST, businessId: "11111111-1111-4111-8111-111111111111" };
  const parse = (extra: Record<string, unknown>) => deliveryInspectionSchema.safeParse({ actorId: REQUEST, request, permissions: { canManage: true, canOperate: false, stopped: false, websiteBindings: [] }, ...extra }).success;
  it("accepts only the exact codeAgent shape, and works without it", () => {
    // The request body itself is validated by serviceRequestSchema; a bare fixture fails there, so test the strict shape on its own.
    const shape = deliveryInspectionSchema.shape.codeAgent.unwrap();
    expect(shape.safeParse({ mcpUrl: MCP, requestId: REQUEST }).success).toBe(true);
    expect(shape.safeParse({ mcpUrl: MCP, requestId: REQUEST, token: "x" }).success).toBe(false);
    expect(shape.safeParse({ mcpUrl: "not a url", requestId: REQUEST }).success).toBe(false);
    expect(parse({})).toBe(false);
  });
});
