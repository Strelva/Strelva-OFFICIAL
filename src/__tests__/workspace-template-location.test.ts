import { describe, expect, it } from "vitest";
import { accountReturnTarget, workspaceReturnTarget } from "@/lib/workspace-location";

describe("template selection through sign-in", () => {
  it("retains the selected template and business without carrying draft contents", () => {
    const target = "/workspace?workspaceId=33333333-3333-4333-8333-333333333333&view=products&template=staff-requests";
    expect(workspaceReturnTarget(target)).toBe(target);
    expect(accountReturnTarget(`/account?next=${encodeURIComponent(target)}`)).toBe(`/account?next=${encodeURIComponent(target)}`);
  });

  it.each([
    "/workspace?view=work&template=staff-requests",
    "/workspace?view=products&template=staff-requests&template=inventory",
    "/workspace?view=products&template=%2Fprivate",
    "/workspace?view=products&template=https%3A%2F%2Fevil.example",
    `/workspace?view=products&template=${"a".repeat(129)}`,
  ])("rejects unrelated or ambiguous template destinations: %s", target => {
    expect(workspaceReturnTarget(target)).toBeNull();
  });
});
