import { describe, expect, it } from "vitest";
import { workspaceReturnTarget } from "@/lib/workspace-location";
const workspaceId = "22222222-2222-4222-8222-222222222222";
describe("workspace return destination", () => {
  it("preserves an exact result and workspace through sign-in", () => {
    const target = `/workspace?workspaceId=${workspaceId}&work=saved-result&view=work`;
    expect(workspaceReturnTarget(target)).toBe(target);
    expect(workspaceReturnTarget("/workspace?save=scan_public123")).toBe("/workspace?save=scan_public123");
  });
  it.each(["https://evil.example/workspace", "//evil.example/workspace", "/workspace/other", "/workspace?next=https://evil.example", "/workspace?work=first&work=second", "/workspace?workspaceId=invalid", "/workspace?work=%2Fprivate", "/workspace#handoff=secret"])("rejects ambiguous or unrelated destinations: %s", value => {
    expect(workspaceReturnTarget(value)).toBeNull();
  });
});
