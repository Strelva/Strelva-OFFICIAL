// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessDetailsForm } from "@/experience/places/BusinessDetailsForm";
import { WorkspaceBusinessDetails } from "@/experience/places/WorkspaceBusinessDetails";
import type { BusinessRecord } from "@/platform/business-record/contracts";

const record: BusinessRecord = { workspaceId: "11111111-1111-4111-8111-111111111111", access: "owner", revision: 7, lastSequence: 7, updatedAt: null, facts: { display_name: { value: "Harbor Dental", source: "owner", verified: true, updatedAt: "2026-10-01T00:00:00Z", updatedBy: "11111111-1111-4111-8111-111111111112" } }, services: [], people: [], contactCount: 0 };

describe("business record rows (XA · R1)", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  it("edits one detail in place, keeps the exact revision and cancels locally", async () => {
    const action = vi.fn();
    await act(async () => root.render(createElement(BusinessDetailsForm, { record, workspaceId: record.workspaceId, readOnly: false, action, now: new Date("2026-10-15T12:00:00Z") })));
    expect(container.textContent).toMatch(/You · (Sep 30|Oct 1)/);
    expect(container.querySelector("form")).toBeNull();
    await act(async () => (container.querySelector('button[aria-label="Change business name: Harbor Dental"]') as HTMLButtonElement).click());
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const input = container.querySelector('input[name="display_name"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Harbor Dental North"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(submit.disabled).toBe(false);
    expect(container.textContent).toContain("Was “Harbor Dental”");
    const form = new FormData(container.querySelector("form")!);
    expect(form.get("revision")).toBe("7");
    // Only the field being edited is submitted, so nothing else can change.
    expect([...form.keys()].sort()).toEqual(["display_name", "revision", "workspaceId"]);
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Cancel")!.click());
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).toContain("Harbor Dental");
    expect(action).not.toHaveBeenCalled();
  });
  it("keeps member rows read-only with no save, and refuses permission data", () => {
    const member = renderToStaticMarkup(createElement(BusinessDetailsForm, { record: { ...record, access: "member" }, workspaceId: record.workspaceId, readOnly: true }));
    expect(member).not.toContain("Change business name");
    expect(member).not.toContain("Save");
    expect(member).toContain("Harbor Dental");
    const denied = renderToStaticMarkup(createElement(WorkspaceBusinessDetails, { workspaceId: record.workspaceId, state: { kind: "permission" } }));
    expect(denied).toContain("This belongs to another business");
    expect(denied).not.toContain("Harbor Dental");
  });
});
