import { describe, expect, it, vi } from "vitest";
import { accountReturnTarget, navigateWorkspace, readWorkspaceLocation, workspaceLocationHref, replaceWorkspaceLocation, workspaceHistoryState, workspaceReturnTarget } from "@/platform/workspaces/location";

it("preserves website creation and saved website destinations through sign-in", () => {
  expect(workspaceReturnTarget("/workspace?view=websites")).toBe("/workspace?view=websites");
  expect(accountReturnTarget("/account?next=%2Fworkspace%3Fview%3Dwebsites%26work%3Dsite-draft")).toBe("/account?next=%2Fworkspace%3Fview%3Dwebsites%26work%3Dsite-draft");
});
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
  it("preserves the agency setup checklist through sign-in and nothing broader", () => {
    expect(workspaceReturnTarget("/workspace/agency/start")).toBe("/workspace/agency/start");
    expect(workspaceReturnTarget(`/workspace/agency/start?workspaceId=${workspaceId}`)).toBe(`/workspace/agency/start?workspaceId=${workspaceId}`);
    expect(workspaceReturnTarget("/workspace/agency/start?workspaceId=not-a-uuid")).toBeNull();
    expect(workspaceReturnTarget(`/workspace/agency/start?workspaceId=${workspaceId}&next=https%3A%2F%2Fevil.example`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/agency/start?workspaceId=${workspaceId}#x`)).toBeNull();
    expect(workspaceReturnTarget("/workspace/agency/other")).toBeNull();
  });
  it("preserves the document start route through sign-in", () => {
    expect(workspaceReturnTarget(`/workspace?workspaceId=${workspaceId}&view=document`)).toBe(`/workspace?workspaceId=${workspaceId}&view=document`);
  });
  it("preserves a System deep link through sign-in and the nested account return", () => {
    const systemId = "44444444-4444-4444-8444-444444444444";
    const target = `/workspace?view=system&system=${systemId}&workspaceId=${workspaceId}`;
    expect(workspaceReturnTarget(target)).toBe(target);
    expect(accountReturnTarget(`/account?next=${encodeURIComponent(target)}`)).toBe(`/account?next=${encodeURIComponent(target)}`);
  });
  it.each([
    "/workspace?view=system&system=invalid&workspaceId=22222222-2222-4222-8222-222222222222",
    "/workspace?view=system&system=44444444-4444-4444-8444-444444444444&workspaceId=invalid",
    "/workspace?view=system&system=44444444-4444-4444-8444-444444444444",
    "/workspace?view=work&system=44444444-4444-4444-8444-444444444444&workspaceId=22222222-2222-4222-8222-222222222222",
    "/workspace?view=system&system=44444444-4444-4444-8444-444444444444&workspaceId=22222222-2222-4222-8222-222222222222&extra=ignored",
    "/workspace?view=system&system=44444444-4444-4444-8444-444444444444&system=44444444-4444-4444-8444-444444444444&workspaceId=22222222-2222-4222-8222-222222222222",
  ])("rejects malformed or mismatched System destinations: %s", (target) => {
    expect(workspaceReturnTarget(target)).toBeNull();
    expect(accountReturnTarget(`/account?next=${encodeURIComponent(target)}`)).toBeNull();
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


it("preserves an exact custom application destination through sign-in", () => {
  const target = `/workspace?workspaceId=${workspaceId}&view=custom-applications&work=private-app`;
  expect(workspaceReturnTarget(target)).toBe(target);
  expect(accountReturnTarget(`/account?next=${encodeURIComponent(target)}`)).toBe(`/account?next=${encodeURIComponent(target)}`);
  expect(workspaceReturnTarget(target + "&next=https%3A%2F%2Fevil.example")).toBeNull();
});

it("strips router state while preserving app state", () => { expect(workspaceHistoryState({ source: "workspace", __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["stale"], _N: true })).toEqual({ source: "workspace" }); expect(workspaceHistoryState({ __NA: true })).toBeNull(); expect(workspaceHistoryState(null)).toBeNull(); expect(workspaceHistoryState([])).toBeNull(); });


const systemId = "44444444-4444-4444-8444-444444444444";
const staleSource = `/workspace?workspaceId=${workspaceId}&view=system&system=${systemId}&work=old&search=1&offering=old&template=old&standingId=${systemId}&assignmentId=${systemId}&tenantId=old&inquiryView=record&inquiryRecord=old&inquiryRequest=old&trackerWork=old&row=old&save=scan_public123`;
it.each([
  { view: "work" }, { view: "tracker" }, { view: "document" }, { view: "plan" }, { view: "applications" },
  { view: "inquiries", tenantId: "harbor" }, { view: "products", offering: "staff" },
  { view: "operations", standingId: systemId }, { view: "ask", system: systemId }, {},
])("complete destination removes all incompatible detail: %j", destination => {
  const href = workspaceLocationHref(staleSource, { workspaceId, ...destination });
  expect(readWorkspaceLocation(new URL(href, "https://test.invalid").searchParams)).toEqual({ workspaceId, ...destination, save: "scan_public123" });
  expect(workspaceReturnTarget(href)).toBe(href);
});
it("keeps preview context outside the location contract", () => {
  expect(workspaceLocationHref(`${staleSource}&scenario=mooney&systems=on`, { workspaceId })).toBe(`/workspace?save=scan_public123&scenario=mooney&systems=on&workspaceId=${workspaceId}`);
});
it.each([
  { view: "system", workspaceId }, { view: "system", system: systemId },
  { view: "tracker", work: "/private" }, { view: "work", system: systemId },
])("refuses an unencodable destination: %j", destination => {
  expect(() => workspaceLocationHref("/workspace", destination)).toThrow("Invalid workspace destination");
});
it("reads aliases, view-less legacy responsibilities, and malformed detail consistently", () => {
  expect(readWorkspaceLocation(new URLSearchParams(`standingId=${systemId}`))).toEqual({ view: "operations", standingId: systemId });
  expect(readWorkspaceLocation(new URLSearchParams(`view=ongoing&standingId=${systemId}`))).toEqual({ view: "ongoing", standingId: systemId });
  expect(readWorkspaceLocation(new URLSearchParams(`view=plan&system=${systemId}&standingId=${systemId}&search=1`))).toEqual({ view: "plan" });
  expect(readWorkspaceLocation(new URLSearchParams("view=system&system=bad"))).toEqual({});
});
it("uses push for opens and replace for acknowledged saves, retaining custom history state", () => {
  const previous = globalThis.window;
  const history = { state: { __NA: true, source: "offering" }, pushState: vi.fn(), replaceState: vi.fn() };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://test.invalid/workspace" }, history } });
  try {
    navigateWorkspace({ workspaceId, view: "tracker" });
    navigateWorkspace({ workspaceId, view: "tracker", work: "saved" }, "replace");
    expect(history.pushState).toHaveBeenCalledWith({ source: "offering" }, "", `/workspace?workspaceId=${workspaceId}&view=tracker`);
    expect(history.replaceState).toHaveBeenCalledWith({ source: "offering" }, "", `/workspace?workspaceId=${workspaceId}&view=tracker&work=saved`);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
    else delete (globalThis as { window?: unknown }).window;
  }
});


it("malformed System identity does not fall through to stale work", () => {
  expect(readWorkspaceLocation(new URLSearchParams("view=system&system=invalid&work=saved"))).toEqual({});
  expect(readWorkspaceLocation(new URLSearchParams(`workspaceId=${workspaceId}&view=system&system=${systemId}&work=%2Fprivate`))).toEqual({ workspaceId, view: "system", system: systemId });
});
it("a move cannot preserve a malformed or repeated public-save hint", () => {
  for (const source of ["/workspace?save=invalid", "/workspace?save=scan_a&save=scan_b"]) {
    const href = workspaceLocationHref(source, { workspaceId, view: "tracker" });
    expect(workspaceReturnTarget(href)).toBe(href);
    expect(new URL(href, "https://test.invalid").searchParams.has("save")).toBe(false);
  }
});
