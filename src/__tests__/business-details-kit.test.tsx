// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessDetailsForm } from "@/experience/places/BusinessDetailsForm";
import { WorkspaceBusinessDetails } from "@/experience/places/WorkspaceBusinessDetails";
import type { BusinessRecord } from "@/platform/business-record/contracts";

const record: BusinessRecord = { workspaceId: "11111111-1111-4111-8111-111111111111", access: "owner", revision: 7, lastSequence: 7, updatedAt: null, facts: { display_name: { value: "Harbor Dental", source: "owner", verified: true, updatedAt: "2026-10-01T00:00:00Z", updatedBy: "11111111-1111-4111-8111-111111111112" } }, services: [], people: [], contactCount: 0 };

describe("business record edit explanation", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  it("compares only changed facts, preserves the exact revision and cancels locally", async () => {
    const action = vi.fn();
    await act(async () => root.render(createElement(BusinessDetailsForm, { record, workspaceId: record.workspaceId, readOnly: false, action })));
    expect(container.textContent).toContain("You said · Confirmed");
    expect(container.textContent).toContain("Usage counts are not available");
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    const input = container.querySelector('input[name="display_name"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Harbor Dental North"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(container.textContent).toContain("Your change will update");
    expect(container.textContent).toContain("Removed: Harbor Dental");
    expect(container.textContent).toContain("Added: Harbor Dental North");
    expect(new FormData(container.querySelector("form")!).get("revision")).toBe("7");
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Cancel changes")!.click());
    expect(input.value).toBe("Harbor Dental");
    expect(action).not.toHaveBeenCalled();
  });
  it("keeps member fields read-only with no save, and refuses permission data", () => {
    const member = renderToStaticMarkup(createElement(BusinessDetailsForm, { record: { ...record, access: "member" }, workspaceId: record.workspaceId, readOnly: true }));
    expect(member).toContain('readOnly=""');
    expect(member).not.toContain("Save details");
    const denied = renderToStaticMarkup(createElement(WorkspaceBusinessDetails, { workspaceId: record.workspaceId, state: { kind: "permission" } }));
    expect(denied).toContain("This belongs to another business");
    expect(denied).not.toContain("Harbor Dental");
  });
});
