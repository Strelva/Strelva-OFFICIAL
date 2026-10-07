// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationUseRenderer, type ApplicationUseDraft } from "@/experience/applications/ApplicationUseRenderer";
import type { ApplicationUseSnapshot } from "@/products/applications/access";
const contactId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";
const fields = [{ id: "title", label: "Business", type: "text" as const, required: true }, { id: "client", label: "Client", type: "contact" as const, required: true },
  { id: "handler", label: "Staff", type: "assigned_person" as const, required: true }];
const values = { title: "Acme", client: contactId, handler: personId };
const snapshot: ApplicationUseSnapshot = { workId: "11111111-1111-4111-8111-111111111111", title: "Intake", releaseVersion: 1,
  views: [{ kind: "form", fields }, { kind: "list", fields }], records: [{ id: "r1", values, revision: 2 }],
  access: { views: ["form", "list"], recordRead: "own", recordEdit: "own", recordSubmit: false, expiresAt: "2027-01-01T00:00:00Z" } };
let container: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === name)!;
function Harness({ onSubmit }: { onSubmit: (draft: ApplicationUseDraft) => void }) {
  const [draft, setDraft] = useState<ApplicationUseDraft>({ values: {}, recordId: "new", idempotencyKey: "new" });
  return createElement(ApplicationUseRenderer, { snapshot, draft, onDraftChange: setDraft, onSubmit });
}
describe("correcting saved contact links", () => {
  it("keeps stored UUIDs out of email validation and preserves them on an unrelated correction", async () => {
    const onSubmit = vi.fn(); await act(async () => root.render(createElement(Harness, { onSubmit })));
    await act(async () => button("Edit record").click());
    const staff = container.querySelector<HTMLInputElement>('input[aria-label="Staff"]')!;
    expect(staff.type).toBe("email"); expect(staff.value).toBe(""); expect(staff.required).toBe(false);
    expect(container.textContent).toContain("A staff member is already linked.");
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    await act(async () => button("Save correction").click());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ values, recordId: "r1", expectedRecordRevision: 2 }));
  });
  it("replaces a saved UUID with the newly typed staff email", async () => {
    const onSubmit = vi.fn(); await act(async () => root.render(createElement(Harness, { onSubmit })));
    await act(async () => button("Edit record").click());
    const staff = container.querySelector<HTMLInputElement>('input[aria-label="Staff"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(staff, "sam@example.test"); staff.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(staff.value).toBe("sam@example.test"); expect(staff.required).toBe(true);
    await act(async () => button("Save correction").click());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ values: { ...values, handler: "sam@example.test" } }));
  });
});
