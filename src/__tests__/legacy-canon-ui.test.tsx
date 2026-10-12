// @vitest-environment jsdom
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StChoiceCards } from "@/components/ui/strelva/ChoiceCards";
import { AiVisibilityPage } from "@/products/ai-visibility/AiVisibilityPage";
import { WorkspaceInvitationManager } from "@/experience/workspace/WorkspaceInvitationManager";
import { ContentWorkspace, type ContentWorkspaceData } from "@/experience/publishing/ContentWorkspace";
import { OwnerInvitationPreview } from "@/app/preview/strelva/owner-invitations/OwnerInvitationPreview";

vi.mock("next/navigation", async importOriginal => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
let root: Root | undefined;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; node?.remove(); vi.unstubAllGlobals(); });
async function mount(element: ReactElement) {
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(element));
  return node;
}

describe("legacy surfaces keep context and usable controls", () => {
  it("places the public check after every required field", () => {
    const html = renderToStaticMarkup(<AiVisibilityPage />);
    const container = document.createElement("div"); container.innerHTML = html;
    const form = container.querySelector("form")!;
    const submit = form.querySelector('button[type="submit"]')!;
    for (const field of form.querySelectorAll("[required]")) {
      expect(field.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(form.querySelector("#business-name")?.hasAttribute("required")).toBe(true);
  });

  it("choice cards keep a single native radio group and switch on the full label", async () => {
    function Choices() {
      const [value, setValue] = useState("business");
      return <StChoiceCards label="Who is this for?" value={value} onChange={setValue} options={[
        { value: "business", label: "I run a business", detail: "Run your own systems." },
        { value: "agency", label: "I build for clients", detail: "Work in client workspaces." },
      ]} />;
    }
    await mount(<Choices />);
    const radios = [...node.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(new Set(radios.map(radio => radio.name)).size).toBe(1);
    expect(radios.filter(radio => radio.checked).map(radio => radio.value)).toEqual(["business"]);
    await act(async () => radios[1]!.closest("label")!.click());
    expect(radios.filter(radio => radio.checked).map(radio => radio.value)).toEqual(["agency"]);
    expect(radios[1]!.closest("label")?.getAttribute("data-selected")).toBe("true");
  });

  it("an unavailable invitation list retains the shell and never claims an empty history", async () => {
    const request = vi.fn(async () => Response.json({ error: "Invitations unavailable." }, { status: 503 }));
    vi.stubGlobal("fetch", request);
    await mount(<WorkspaceInvitationManager workspaceId={workspaceId} />);
    expect(node.querySelector('[data-workspace-theme="linen"]')).not.toBeNull();
    expect(node.querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(node.textContent).toContain("Invitation history could not be read.");
    expect(node.textContent).not.toContain("No workspace invitations yet.");
    expect(node.textContent).toContain("Reload invitations");
  });

  it.each(["ready", "denied", "unavailable", "owned", "pending"])("owner invitation %s keeps paper tokens and the business", state => {
    const html = renderToStaticMarkup(<OwnerInvitationPreview state={state} />);
    expect(html).toContain('data-workspace-theme="linen"');
    expect(html).toContain("Example Law Firm");
    expect(html).toContain("Invite the business owner");
    expect(html).not.toContain("bg-surface-base");
  });

  it("website publication preserves the exact decision and requires reload after refusal", async () => {
    const initial: ContentWorkspaceData = { permissions: { canCompose: true, canApprove: true }, content: {
      entries: [], outputs: [], sendingEnabled: false,
      drafts: [{ id: "exact-draft", title: "Office hours", body: "Closed Friday", status: "pending", metadata: { publishing: { data: { title: "Office hours", body: "Closed Friday" } } } }],
    } };
    const request = vi.fn<typeof fetch>(async () => Response.json({ error: "Approval refused." }, { status: 403 }));
    await mount(<ContentWorkspace workspaceId={workspaceId} systemId="exact-system" kind="website" standalone initial={initial} request={request} />);
    expect(node.querySelector("h1")?.textContent).toBe("Website content");
    const approve = [...node.querySelectorAll("button")].find(button => button.textContent === "Make it live")!;
    await act(async () => approve.click());
    expect(request).toHaveBeenCalledWith("/api/workspace/publishing/content", expect.objectContaining({
      method: "POST", body: JSON.stringify({ workspaceId, systemId: "exact-system", action: "approve", eventId: "exact-draft" }),
    }));
    expect(node.textContent).toContain("Approval refused.");
    expect(node.textContent).toContain("Closed Friday");
    expect(approve.disabled).toBe(true);
    await act(async () => approve.click());
    expect(request).toHaveBeenCalledTimes(1);
  });
});
