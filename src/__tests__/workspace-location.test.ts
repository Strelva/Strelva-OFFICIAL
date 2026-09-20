import { describe, expect, it, vi } from "vitest";
import { accountReturnTarget, replaceWorkspaceLocation, workspaceReturnTarget } from "@/lib/workspace-location";
const workspaceId = "22222222-2222-4222-8222-222222222222";
describe("workspace return destination", () => {
  it("preserves an exact result and workspace through sign-in", () => {
    const target = `/workspace?workspaceId=${workspaceId}&work=saved-result&view=work`;
    expect(workspaceReturnTarget(target)).toBe(target);
    expect(workspaceReturnTarget("/workspace?save=scan_public123")).toBe("/workspace?save=scan_public123");
    expect(workspaceReturnTarget("/workspace/account?continue=public")).toBe("/workspace/account?continue=public");
  });
  it("keeps an invitation claim in front of an exact workspace result", () => {
    const target = `/workspace?save=scan_public123`;
    expect(accountReturnTarget(`/account?next=${encodeURIComponent(target)}`)).toBe(
      `/account?next=${encodeURIComponent(target)}`,
    );
    expect(accountReturnTarget("/account?next=https%3A%2F%2Fevil.example")).toBeNull();
    expect(accountReturnTarget("/account?next=%2Fworkspace%3Fsave%3Dscan_public123&next=%2Fworkspace")).toBeNull();
  });
  it("preserves embedded inquiry state through sign-in", () => {
    const target = `/workspace?workspaceId=${workspaceId}&view=inquiries&tenantId=buffalo-realty&inquiryView=shape&inquiryRequest=request-1`;
    expect(workspaceReturnTarget(target)).toBe(target);
  });
  it("preserves the document start route through sign-in", () => {
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=document`)).toBe(`/workspace?workspaceId=${workspaceId}&view=document`);
  });
  it("preserves a new horizontal job and an exact linked tracker record", () => {
    for (const view of ["applications", "scheduling", "investigations", "operations", "product-learning"]) {
      const target = `/workspace?workspaceId=${workspaceId}&view=${view}`;
      expect(workspaceReturnTarget(target)).toBe(target);
    }
    const record = `/workspace?workspaceId=${workspaceId}&view=tracker&work=saved-tracker&row=row-2`;
    expect(workspaceReturnTarget(record)).toBe(record);
    expect(workspaceReturnTarget("/workspace?view=tracker&work=saved-tracker&row=source-import%3Arow%3A2")).toBe("/workspace?view=tracker&work=saved-tracker&row=source-import%3Arow%3A2");
    expect(workspaceReturnTarget("/workspace?row=row-2&view=operations")).toBeNull();
    expect(workspaceReturnTarget("/workspace?view=tracker&work=saved-tracker&row=%2Fprivate")).toBeNull();
  });
  it("preserves business access and exact offering destinations through sign-in", () => {
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=access`)).toBe(`/workspace?workspaceId=${workspaceId}&view=access`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=products&offering=private_staff_requests`)).toBe(`/workspace?workspaceId=${workspaceId}&view=products&offering=private_staff_requests`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=products&offering=33333333-3333-4333-8333-333333333333`)).toBe(`/workspace?workspaceId=${workspaceId}&view=products&offering=33333333-3333-4333-8333-333333333333`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=work&offering=private_staff_requests`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=products&offering=%2Fprivate`)).toBeNull();
  });

  it("accepts the cleaned connected-work destination through auth", () => {
    const target = `/workspace?workspaceId=${workspaceId}&view=work&work=saved-result`;
    expect(workspaceReturnTarget(target)).toBe(target);
    expect(accountReturnTarget(`/account?next=${encodeURIComponent(target)}`)).toBe(`/account?next=${encodeURIComponent(target)}`);
  });

  it("removes a stale offering selection when replacing the location with work", () => {
    const target = `https://app.strelva.com/workspace?workspaceId=${workspaceId}&view=work&offering=private_staff_requests`;
    const history = { state: { source: "test" }, replaceState: vi.fn() };
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: target }, history } });
    try {
      replaceWorkspaceLocation(workspaceId, "saved-result");
      expect(history.replaceState).toHaveBeenCalledWith(history.state, "", `/workspace?workspaceId=${workspaceId}&view=work&work=saved-result`);
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
      else delete (globalThis as { window?: unknown }).window;
    }
  });
  it("preserves the business topology and bounded search destinations through sign-in", () => {
    for (const view of ["ongoing", "settings"]) {
      const target = `/workspace?workspaceId=${workspaceId}&view=${view}`;
      expect(workspaceReturnTarget(target)).toBe(target);
    }
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=work&search=1`)).toBe(`/workspace?workspaceId=${workspaceId}&view=work&search=1`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=settings&search=1`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=work&search=yes`)).toBeNull();
  });
  it("preserves exact ongoing-work records through sign-in", () => {
    const standingId = "33333333-3333-4333-8333-333333333333";
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=ongoing&standingId=${standingId}`)).toBe(`/workspace?workspaceId=${workspaceId}&view=ongoing&standingId=${standingId}`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=work&standingId=${standingId}`)).toBeNull();
  });
  it("preserves an exact operational assignment through sign-in", () => {
    const assignmentId = "33333333-3333-4333-8333-333333333333";
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=operations&assignmentId=${assignmentId}`)).toBe(`/workspace?workspaceId=${workspaceId}&view=operations&assignmentId=${assignmentId}`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=work&assignmentId=${assignmentId}`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=operations&assignmentId=invalid`)).toBeNull();
  });
  it.each(["https://evil.example/workspace", "//evil.example/workspace", "/workspace/other", "/workspace?next=https://evil.example", "/workspace?work=first&work=second", "/workspace?workspaceId=invalid", "/workspace?work=%2Fprivate", "/workspace?view=inquiries&inquiryView=publish", "/workspace?view=inquiries&tenantId=bad%2Ftenant", "/workspace?view=inquiries&tenantId=one&tenantId=two", "/workspace#handoff=secret"])("rejects ambiguous or unrelated destinations: %s", value => {
    expect(workspaceReturnTarget(value)).toBeNull();
  });
});
