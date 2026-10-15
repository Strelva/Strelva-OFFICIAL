// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.value) }));

import { CalendarConnectionPanel } from "@/experience/scheduling/CalendarConnectionPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const workspaceId = "22222222-2222-4222-8222-222222222222";
let root: Root, container: HTMLDivElement;

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); search.value = ""; });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function mount(setup: { google: boolean; outlook: boolean }) {
  const transport = async () => Response.json({ connections: [], setup });
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: transport as typeof fetch }, createElement(CalendarConnectionPanel, { workspaceId }))));
}
const connectButton = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === `Connect ${label}`);

describe("calendar connection panel setup state", () => {
  it("says Not set up yet and disables Connect for a provider Strelva has no keys for", async () => {
    await mount({ google: true, outlook: false });
    expect(container.textContent).toContain("Not set up yet");
    expect(container.textContent).toContain("Strelva hasn’t set up Microsoft Outlook yet.");
    expect(connectButton("Microsoft Outlook")?.disabled).toBe(true);
    expect(connectButton("Google Calendar")?.disabled).toBe(false);
  });

  it("shows the outcome the OAuth callback put in the URL", async () => {
    search.value = "view=scheduling&calendarError=Calendar%20authorization%20was%20cancelled%20or%20incomplete.";
    await mount({ google: true, outlook: true });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Calendar authorization was cancelled or incomplete.");
  });
});
