import { beforeEach, describe, expect, it, vi } from "vitest";

const preview = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/experience/workspace/preview/enabled", () => ({ strelvaUiPreviewEnabled: () => preview.enabled }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => { throw new Error(`REDIRECT:${destination}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
import WorkspacePreviewAlias from "@/app/preview/strelva/workspace/page";

describe("local workspace entrance", () => {
  beforeEach(() => { preview.enabled = true; });

  it.each([
    ["11111111-1111-4111-8111-111111111111", "managed"],
    ["22222222-2222-4222-8222-222222222222", "agency"],
    ["33333333-3333-4333-8333-333333333333", "read-only"],
  ])("opens the account's selected workspace %s", async (workspaceId, scenario) => {
    await expect(WorkspacePreviewAlias({ searchParams: Promise.resolve({ workspaceId }) }))
      .rejects.toThrow(`REDIRECT:/preview/strelva?workspaceId=${workspaceId}&scenario=${scenario}`);
  });

  it("preserves ongoing navigation without forwarding unrelated query fields", async () => {
    await expect(WorkspacePreviewAlias({ searchParams: Promise.resolve({
      view: "ongoing", scenario: "business", standingId: "responsibility", assignmentId: "assignment", unrelated: "drop",
    }) })).rejects.toThrow("REDIRECT:/preview/strelva?view=ongoing&scenario=business&standingId=responsibility&assignmentId=assignment");
  });

  it("keeps the open System and the fixture switches so a System page survives a reload", async () => {
    await expect(WorkspacePreviewAlias({ searchParams: Promise.resolve({
      scenario: "mooney", workspaceId: "a0000000-0000-4000-8000-000000000001", view: "system", system: "b0000000-0000-4000-8000-000000000004", systems: "on", websiteDetail: "partial", makeReal: "partly",
    }) })).rejects.toThrow("REDIRECT:/preview/strelva?view=system&scenario=mooney&workspaceId=a0000000-0000-4000-8000-000000000001&systems=on&system=b0000000-0000-4000-8000-000000000004&makeReal=partly&websiteDetail=partial");
  });

  it("does not expose the preview while its explicit gate is closed", async () => {
    preview.enabled = false;
    await expect(WorkspacePreviewAlias({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  });
});
