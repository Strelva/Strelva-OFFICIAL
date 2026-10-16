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

  it("release off: one headline, one quiet line, one action, and no builder words", () => {
    const workspace = text(html(<XaNotOpenYet />));
    const start = text(html(<XaNotOpenYet place="getting-started" />));
    expect(workspace).toContain("Strelva opens soon. Your site and bookings keep running.");
    expect(start).toContain("Getting started opens soon. Your site and bookings keep running.");
    for (const words of [workspace, start]) {
      expect(words.toLowerCase()).not.toMatch(/onboarding|release check|services are unchanged/);
    }
    expect((html(<XaNotOpenYet />).match(/<h1/g) ?? []).length).toBe(1);
    expectNoSlop(html(<XaNotOpenYet />));
  });

  it("not found puts Pebble beside an empty address, with no felt slab or caption block", () => {
    const markup = html(<XaNotFound />);
    expect(markup).toContain("pose-alone");
    expect(markup).not.toContain("pose-website");
    expect(markup).not.toContain("What this means");
    expect(text(markup)).not.toContain("Looking for a business");
  });

  it("the workspace that could not open offers the right single next step for each reason", () => {
    const props = { signInHref: "/sign-in", accountHref: "/workspace/account", onRetry: () => undefined };
    expect(text(html(<XaWorkspaceUnopened reason="sign-in" {...props} />))).toContain("Sign in to open your workspace.");
    expect(text(html(<XaWorkspaceUnopened reason="forbidden" {...props} />))).toContain("Choose another business");
    const failed = text(html(<XaWorkspaceUnopened reason="failed" message="The read timed out." {...props} />));
    // XS: Strelva names itself as the one that couldn't reach it; the system's own words stay out.
    expect(failed).toContain("Strelva couldn’t reach your workspace. Nothing in it changed.");
    expect(failed).not.toContain("The read timed out.");
    expect(text(html(<XaWorkspaceUnopened reason="forbidden" message="This link was sent to frontdesk@harbordental.com." {...props} />))).toContain("frontdesk@harbordental.com");
    for (const reason of ["sign-in", "forbidden", "gone", "failed"] as const) expectNoSlop(html(<XaWorkspaceUnopened reason={reason} {...props} />));
    expectNoSlop(html(<XaSharedReadOnlyEmpty business="Harbor Dental" />));
    expect(text(html(<XaWorkspaceOpening />))).toContain("Opening Strelva");
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

  it("an agency person sees clients as Client, never Your business", () => {
    const words = text(html(<WorkspaceAccountView signOut={null} sites={[]} name="Maya Okafor" email="maya@northstudio.co" emailConfirmed releaseOpen workspaces={[
      { id: "a", kind: "agency", name: "North Studio", access: "member" },
      { id: "b", kind: "customer", name: "Harbor Dental", access: "provider_seat" },
      { id: "c", kind: "customer", name: "Lakeview Mediation", access: "delegated_read" },
    ]} />));
    expect(words).toContain("Harbor Dental Client Open");
    expect(words).toContain("Client · Read-only access");
    expect(words).not.toContain("Your business");
  });

  it("names older websites by domain and says what each row opens", () => {
    const markup = html(<WorkspaceAccountView signOut={null} sites={[{ id: "t", domain: "harbordental.com", href: "https://admin.harbordental.com/dashboard" }]} name="Dr. Amy Lin" email="amy@harbordental.com" emailConfirmed releaseOpen workspaces={[{ id: "h", kind: "customer", name: "Harbor Dental", access: "member" }]} />);
    const words = text(markup);
    expect(words).toContain("Your other websites");
    expect(words).toContain("harbordental.com");
    expect(words).not.toMatch(/Managed websites|from before workspaces/);
    expect(markup).toContain('href="https://admin.harbordental.com/dashboard"');
    expect((words.match(/Open/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(words).toContain("Your account is yours.");
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

describe("XS · search", () => {
  it("shows a result's kind and clay, status only when it waits, and no key legend", async () => {
    const { WorkspaceSearchDialog } = await import("@/experience/workspace/WorkspaceSearchDialog");
    const markup = html(<WorkspaceSearchDialog open={false} scopeName="Harbor Dental" onClose={() => undefined} items={[
      { id: "1", title: "harbordental.com", detail: "Website", kind: "website", href: "/a" },
      { id: "2", title: "Close for Thanksgiving", detail: "Request", kind: "documents", waits: true, href: "/b" },
    ]} />);
    expect(markup).toContain("system-website");
    expect((text(markup).match(/Waits for you/g) ?? []).length).toBe(1);
    expect(text(markup)).not.toMatch(/Choose|Esc/);
    expect(text(markup)).not.toMatch(/\bLive\b|\bDraft\b/);
  });

  it("drops the result count when nothing matches", async () => {
    const { WorkspaceSearchDialog } = await import("@/experience/workspace/WorkspaceSearchDialog");
    const markup = html(<WorkspaceSearchDialog open={false} scopeName="Harbor Dental" onClose={() => undefined} items={[]} />);
    expect(text(markup)).not.toContain("0 results");
    expect(text(markup)).toContain("Nothing saved yet.");
  });
});
