import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DecisionPolicyPanel, type DecisionPolicyState } from "@/experience/workspace/DecisionPolicySettings";
import { WorkspaceBusinessSettings } from "@/experience/workspace/WorkspaceBusinessSettings";
import { buildPolicyView, type PolicyRows } from "@/platform/needs-you/policy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

const rows: PolicyRows = {
  settings: [{ layer: "owner", kind: "google.post", systemId: null, route: "owner_decides", version: 1, reason: "owner_setting", updatedAt: null }],
  history: [{ id: "bbbbbbbb-0000-4000-8000-000000000001", systemId: null, kind: "google.post", layer: "owner", oldRoute: null, newRoute: "owner_decides", reason: "owner_setting", version: 1, at: "2026-10-06T10:00:00Z" }],
};
const render = (state: DecisionPolicyState, notice: Parameters<typeof DecisionPolicyPanel>[0]["notice"] = null) =>
  renderToStaticMarkup(createElement(DecisionPolicyPanel, { state, pending: null, notice, onChange: () => undefined, onRetry: () => undefined }));

describe("who decides settings", () => {
  it("lets the owner choose only Strelva's default or stricter, with back to default and undo", () => {
    const html = render({ status: "ready", role: "owner", view: buildPolicyView(rows) });
    expect(html).toContain("Who decides");
    expect(html).toContain("Google posts");
    // Routine edits: Strelva reviews is the loosest an owner can pick.
    const routine = html.slice(html.indexOf("Routine website edits"), html.indexOf("New website copy"));
    expect(routine).toContain("Strelva reviews it (default)");
    expect(routine).not.toContain(">Strelva handles it<");
    const posts = html.slice(html.indexOf("Google posts"), html.indexOf("Google photos"));
    expect(posts).toContain("Back to default");
    expect(posts).toContain('aria-label="Undo your last change to Google posts"');
    expect(posts).toContain("Your setting.");
    expect(html).toContain("Always yours");
    const always = html.slice(html.indexOf("Always yours"));
    for (const label of ["Details Strelva found", "Access", "Money", "Leaving or exporting"]) expect(always).toContain(label);
    expect(always).not.toContain("<select");
    // A kind with nothing stricter to pick shows its route, not a one-option menu.
    const structure = html.slice(html.indexOf("Website structure"), html.indexOf("Details you gave us"));
    expect(structure).not.toContain("<select");
    expect(structure).toContain("You decide. Nothing happens until you say yes.");
    // Strelva's housekeeping kinds are not the owner's to set.
    expect(html).not.toContain("Unconfirmed changes");
  });

  it("shows members the settings without controls", () => {
    const html = render({ status: "ready", role: "member", view: buildPolicyView(rows) });
    expect(html).toContain("Only the owner can change these.");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Back to default");
    expect(html).toContain("You decide. Nothing happens until you say yes.");
  });

  it("has honest loading, error and notice states, and is gone when off", () => {
    expect(render({ status: "loading" })).toContain("Checking who decides");
    const error = render({ status: "error", message: "Who decides could not be loaded. Nothing about it changed." });
    expect(error).toContain("Nothing about it changed.");
    expect(error).toContain("Check again");
    expect(render({ status: "disabled" })).toBe("");
    const refused = render({ status: "ready", role: "owner", view: buildPolicyView(rows) }, { kind: "google.post", tone: "error", text: "You can loosen this only back to Strelva's default." });
    expect(refused).toContain("You can loosen this only back to Strelva&#x27;s default.");
  });

  it("is not on the settings page while Needs you is off", () => {
    const props = { workspace: { id: "a0000000-0000-4000-8000-000000000001", kind: "customer", access: "member", role: "owner", name: "Mooney" } as never, sites: [], siteAssignmentState: "known" as const, accountHref: "/workspace/account" };
    expect(renderToStaticMarkup(createElement(WorkspaceBusinessSettings, props))).not.toContain("Who decides");
    expect(renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { ...props, needsYouReleased: true }))).toContain("Checking who decides");
    expect(renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { ...props, needsYouReleased: true, workspace: { ...props.workspace as object, access: "delegated_read" } as never }))).not.toContain("Who decides");
  });
});
