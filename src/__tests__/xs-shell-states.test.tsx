import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error("not-found"); }, redirect: () => { throw new Error("redirect"); } }));
import { XaNotFound, XaNotOpenYet, XaPageBroke, XaSharedReadOnlyEmpty, XaWorkspaceOpening, XaWorkspaceUnopened } from "@/experience/states/XaStates";
import { GlobalErrorBody } from "@/experience/states/GlobalErrorDocument";
import { WorkspaceAccountView } from "@/experience/workspace/WorkspaceAccountView";
import { renderPaperEmailHtml, renderPaperEmailText } from "@/platform/infra/email/paper";
import { exportReadyPaperEmail, ownerInvitationPaperEmail, teamInvitationPaperEmail } from "@/platform/infra/email/paper-templates";

const html = (node: ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/** The anti-slop rules that can be read from markup alone. */
function expectNoSlop(markup: string) {
  expect(markup).not.toMatch(/font-mono|monospace|Geist Mono/);
  expect(markup).not.toMatch(/uppercase|tracking-\[/);
  expect(markup).not.toMatch(/linear-gradient|radial-gradient/);
  expect(text(markup)).not.toMatch(/—|\$—|lorem|seamless|effortless|powerful|unlock|supercharge|magic|AI-powered|actor not recorded/i);
  expect((markup.match(/data-xa-primary/g) ?? []).length).toBeLessThanOrEqual(1);
}

describe("XS · in-between pages", () => {
  it("not found: one ink pill home, text links, no error detail", () => {
    const markup = html(<XaNotFound />);
    expect(text(markup)).toContain("This page isn’t here.");
    expect(markup).toContain('href="/workspace"');
    expectNoSlop(markup);
  });

  it("a broken page reports nothing to the person but says nothing was sent or changed", () => {
    const markup = html(<XaPageBroke onRetry={() => undefined} />);
    expect(text(markup)).toContain("Try again");
    expect(text(markup)).toContain("Nothing was sent or changed.");
    expect(markup).toContain("pose-fixing");
    expectNoSlop(markup);
  });

  it("release off says what still works and uses Getting started, not onboarding", () => {
    const workspace = text(html(<XaNotOpenYet />));
    const start = text(html(<XaNotOpenYet place="getting-started" />));
    expect(workspace).toContain("Existing client services are unchanged.");
    expect(start).toContain("Getting started opens with them");
    expect(start.toLowerCase()).not.toContain("onboarding");
    expectNoSlop(html(<XaNotOpenYet />));
  });

  it("the workspace that could not open offers the right single next step for each reason", () => {
    const props = { signInHref: "/sign-in", accountHref: "/workspace/account", onRetry: () => undefined };
    expect(text(html(<XaWorkspaceUnopened reason="sign-in" {...props} />))).toContain("Sign in to open your workspace.");
    expect(text(html(<XaWorkspaceUnopened reason="forbidden" {...props} />))).toContain("Choose another workspace");
    expect(text(html(<XaWorkspaceUnopened reason="failed" message="The read timed out." {...props} />))).toContain("The read timed out.");
    for (const reason of ["sign-in", "forbidden", "gone", "failed"] as const) expectNoSlop(html(<XaWorkspaceUnopened reason={reason} {...props} />));
    expectNoSlop(html(<XaSharedReadOnlyEmpty business="Harbor Dental" />));
    expect(text(html(<XaWorkspaceOpening />))).toContain("Opening your workspace");
  });

  it("the root crash fallback shows no error text and offers a full reload", () => {
    const markup = html(<GlobalErrorBody />);
    expect(markup).toContain('href="/"');
    expect(text(markup)).toContain("Reload Strelva");
    expectNoSlop(markup);
  });
});

describe("XS · account", () => {
  it("names read-only access only where it differs and never shows an id", () => {
    const markup = html(<WorkspaceAccountView signOut={null} name="Dr. Amy Lin" email="amy@harbordental.com" emailConfirmed releaseOpen workspaces={[
      { id: "d2960000-0000-4000-8000-000000000001", kind: "customer", name: "Harbor Dental", access: "member" },
      { id: "d2960000-0000-4000-8000-000000000003", kind: "customer", name: "Lakeview Mediation", access: "delegated_read" },
    ]} />);
    const words = text(markup);
    expect(words).toContain("Your business");
    expect(words).toContain("Client · Read-only access");
    expect(words).not.toContain("d2960000");
    expectNoSlop(markup);
  });

  it("an unconfirmed email waits in clay and hides places", () => {
    const words = text(html(<WorkspaceAccountView signOut={null} name={null} email="amy@harbordental.com" emailConfirmed={false} releaseOpen workspaces={[{ id: "x", kind: "customer", name: "Harbor Dental", access: "member" }]} />));
    expect(words).toContain("Confirmation needed");
    expect(words).not.toContain("Harbor Dental");
  });
});

describe("XS · emails (templates only)", () => {
  const accept = { label: "Accept the invitation", url: "https://example.test/accept" };
  it("teammate invitation names the inviter, keeps its subject, and uses the ink pill", () => {
    const email = teamInvitationPaperEmail({ workspace: "Harbor Dental", inviter: "Dr. Amy Lin", recipient: "frontdesk@harbordental.com", owner: false, accept });
    expect(email.subject).toBe("Join Harbor Dental on Strelva");
    expect(renderPaperEmailText(email)).toContain("Dr. Amy Lin invited you to join Harbor Dental on Strelva.");
    const markup = renderPaperEmailHtml(email);
    expect(markup).toContain("background:#161715");
    expectNoSlop(markup);
  });

  it("owner invitation and export ready carry no monospace and no em dash", () => {
    const identity = { sender: "North Studio", senderDetail: "to amy@harbordental.com" };
    const owner = ownerInvitationPaperEmail({ ...identity, business: "Harbor Dental", greeting: "Hi Dr. Lin.", systems: [{ label: "harbordental.com", value: "Live", tone: "live" }], accept, expires: "Oct 23", invitedBy: "Maya Okafor at North Studio" });
    const exported = exportReadyPaperEmail({ ...identity, business: "Harbor Dental", filename: "harbor-dental.zip", fileDetail: "18 MB", included: "Website", omitted: "Card details", download: accept, linkNote: "Works for 7 days.", requestedBy: "Dr. Amy Lin asked for this." });
    for (const email of [owner, exported]) expectNoSlop(renderPaperEmailHtml(email));
    expect(owner.preheader).toBeTruthy();
  });
});
