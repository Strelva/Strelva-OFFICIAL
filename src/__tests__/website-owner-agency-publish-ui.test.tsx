// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RebuildExperience } from "@/experience/websites/RebuildExperience";
import { fixtureRebuild } from "@/experience/websites/rebuild-fixture";
import type { RebuildTransport, RebuildView } from "@/experience/websites/rebuild-transport";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); });
function ownerRecord(approved = false): RebuildView {
  const record = fixtureRebuild();
  record.candidate!.facts = {};
  record.approved = approved;
  record.status = approved ? "approved" : "review";
  record.agencyPublishPermission = { agencyWorkspaceId: "71000000-0000-4000-8000-000000000004", agencyName: "Workflow Agency", granted: false };
  return record;
}
async function mount(record: RebuildView, mutate = vi.fn(async () => record), readOnly = false) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
  await act(async () => root!.render(createElement(RebuildExperience,{ workspaceId: record.workspaceId, initialRecord: record, transport, managed: true, readOnly })));
  const frame = container.querySelector("iframe")!;
  const previewDocument = frame.contentDocument!;
  previewDocument.open(); previewDocument.write("<!doctype html><html><head></head><body></body></html>"); previewDocument.close();
  const meta = previewDocument.createElement("meta"); meta.name = "strelva-site-hash"; meta.content = record.candidate!.contentHash;
  previewDocument.head.append(meta);
  await act(async () => frame.dispatchEvent(new Event("load")));
  return mutate;
}
describe("owner consent at website approval", () => {
  it("starts unchecked and approves without granting when unchanged", async () => {
    const record = ownerRecord(); const mutate = await mount(record);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.closest("label")?.textContent).toContain("Allow Workflow Agency to publish this website after I approve each change.");
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Approve this preview")!.click());
    expect(mutate).toHaveBeenCalledWith(record,"approve",undefined);
  });
  it("lets the owner explicitly authorize agency publishing after anonymous approval", async () => {
    const record = ownerRecord(true); const mutate = await mount(record);
    expect(container.textContent).not.toContain("Approve preview and allow agency publishing");
    await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    const button = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Approve preview and allow agency publishing")!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(mutate).toHaveBeenCalledWith(record,"approve",{ allowAgencyPublish:true, agencyWorkspaceId:record.agencyPublishPermission!.agencyWorkspaceId });
  });
  it("retains explicit consent after a failure without claiming it saved", async () => {
    const record = ownerRecord(); const mutate = vi.fn(async () => { throw new Error("Your agency access changed. Reload before authorizing publishing."); });
    await mount(record,mutate);
    await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Approve this preview")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("agency access changed");
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(container.textContent).not.toContain("may publish this website after your approval");
  });
  it("routes the published agency client's domain question to the serving agency", async () => {
    const record = ownerRecord(true); record.publishedUrl = "https://website.example.test/";
    await mount(record);
    expect(container.textContent).toContain("Ask Workflow Agency about domain setup and verification.");
    expect(container.textContent).not.toContain("Strelva handles your domain setup and verification.");
  });
  it("does not promise delivery or domain control without a selected agency", async () => {
    const record = ownerRecord(true); record.agencyPublishPermission = null;
    await mount(record);
    expect(container.textContent).toContain("No agency publication authority is shown here.");
    expect(container.textContent).toContain("Domain changes require separate permission.");
    expect(container.textContent).not.toContain("Strelva will handle");
    expect(container.textContent).not.toContain("Publish approved website");
  });
  it("hides consent for a provider and disables it in read-only owner views", async () => {
    const record = ownerRecord(); record.agencyPublishPermission = null;
    await mount(record);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await act(async () => root!.unmount()); container.remove();
    await mount(ownerRecord(),undefined,true);
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true);
  });
});
