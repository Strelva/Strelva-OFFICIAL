// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InquiryInbox } from "@/experience/places/InquiryInbox";
import { WorkspaceInquiryReply } from "@/experience/places/WorkspaceInquiryReply";

it("keeps an unsent reply when the owner opens another person and returns", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<InquiryInbox entries={[
      { id: "one", name: "First person", summary: "First inquiry", at: "Oct 9", waiting: true, record: <WorkspaceInquiryReply workspaceId="workspace" rowId="one" name="First person" email="first@example.invalid" /> },
      { id: "two", name: "Second person", summary: "Second inquiry", at: "Oct 8", waiting: false, record: <p>Second inquiry record</p> },
    ]} />));
    const field = container.querySelector("textarea")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Keep this exact draft"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    const rows = container.querySelectorAll('ul[aria-label="People who reached out"] button');
    await act(async () => (rows[1] as HTMLButtonElement).click());
    expect(container.querySelector('section[aria-label="Inquiry from First person"]')?.hasAttribute("hidden")).toBe(true);
    await act(async () => (rows[0] as HTMLButtonElement).click());
    expect(container.querySelector('section[aria-label="Inquiry from First person"]')?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("textarea")?.value).toBe("Keep this exact draft");
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});

it("keeps the fictional System preview reply entirely in the browser", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const outside = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", outside);
  const { InquirySystemPreview } = await import("@/experience/workspace/preview/InquirySystemPreview");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const button = (name: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === name)!;
  try {
    await act(async () => root.render(<InquirySystemPreview />));
    const field = container.querySelector('[aria-label="Reply to Priya S."] textarea')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "This is fictional"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => button("Send to Priya").click());
    expect(container.textContent).toContain("Email is paused. Nothing was sent.");
    expect(outside).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); expect(window.fetch).toBe(outside); container.remove(); vi.unstubAllGlobals(); }
});
