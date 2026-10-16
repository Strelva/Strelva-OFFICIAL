import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";
import { readOwnerBrand } from "@/experience/app-frame/workspace-header";
import { WorkspacePhoneTabs } from "@/experience/app-frame/WorkspacePhoneTabs";
import { PossibilityTry } from "@/experience/systems/PossibilityTry";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { AgencyClientChanges } from "@/experience/workspace/AgencyClientHomeSections";
import { agencyClientHomeSchema } from "@/experience/workspace/agency-client-home";
import { readAskResult, receiptLines } from "@/experience/ask/ask-model";
import type { OwnerBrand } from "@/platform/infra/agency-brand";

const businessId = "11111111-1111-4111-8111-111111111111";
const systemId = "22222222-2222-4222-8222-222222222222";
const brand: OwnerBrand = { agencyId: systemId, name: "North Studio", logoUrl: null, accentColor: "#447a4f", replyTo: "agency@example.test", credit: "runs_on_strelva" };

function sidebar(workspaceName: string, ownerBrand?: OwnerBrand, systemsReleased = false) {
  return renderToStaticMarkup(<StrelvaSidebar workspaceName={workspaceName} ownerBrand={ownerBrand} accountName="Jo" signOut={null} systemsReleased={systemsReleased} />);
}

describe("workspace chrome identity", () => {
  it.each(["North Studio", "North Studio / Harbor Dental", "Harbor Dental"])("uses the same header and quiet credit in %s", name => {
    const html = sidebar(name, brand);
    expect(html).toContain(`aria-label="${name} home"`);
    expect(html.match(/Runs on Strelva/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Strelva platform"');
    expect(html).not.toContain("Contact your agency");
    expect(html).not.toContain(">Strelva<");
    expect(html).toContain(">Jo<");
    expect(html).not.toContain("Sign in");
  });
  it("promotes existing plain context labels without a duplicate header", () => {
    const html = renderToStaticMarkup(<StrelvaSidebar businessContext={<span>Harbor Dental</span>} accountName="Jo" signOut={null} />);
    expect(html).toContain('aria-label="Harbor Dental home"');
    expect(html.match(/>Harbor Dental</g)).toHaveLength(1);
  });
  it("keeps direct and failed brand reads neutral", () => {
    for (const value of [null, {}, { ...brand, name: "" }, { ...brand, agencyId: {} }, { ...brand, logoUrl: "javascript:alert(1)" }]) expect(readOwnerBrand(value)).toBeNull();
    expect(readOwnerBrand(brand)).toEqual(brand);
    const direct = sidebar("Harbor Dental");
    expect(direct).toContain("Harbor Dental");
    expect(direct).not.toContain("Runs on Strelva");
    const failed = sidebar("Harbor Dental", { ...brand, agencyId: null, name: "Agency identity unavailable" });
    expect(failed).toContain("Agency identity unavailable");
    expect(failed).not.toContain(">Strelva<");
    expect(failed).not.toContain("Runs on Strelva");
  });
  it.each([false, true])("gates and names both list and phone navigation with Systems=%s", released => {
    const html = sidebar("Harbor Dental", undefined, released);
    expect(html).toContain(released ? "All systems and files" : "Files and results");
    expect(html).not.toContain("All files and results");
    const tabs = renderToStaticMarkup(<WorkspacePhoneTabs systemsReleased={released} workspaceId={businessId} active="ask" />);
    expect(tabs).toContain("Ask Strelva");
    expect(tabs).toContain(`view=ask&amp;workspaceId=${businessId}`);
    expect(tabs.includes(">Systems<")).toBe(released);
    expect(tabs).not.toContain("Chats");
  });
});

describe("recorded actors survive chrome projections", () => {
  it.each([
    [{ kind: "agency", displayName: "North Studio" }, "North Studio · Runs on Strelva"],
    [{ kind: "person", displayName: "Jo" }, "Jo"],
    [{ kind: "platform" }, "Strelva"],
    [null, "Actor not recorded"],
    [{ kind: "agency", displayName: "" }, "Actor not recorded"],
  ])("keeps each shared change's actor, including missing and malformed records", (actor, label) => {
    const data = agencyClientHomeSchema.parse({ workspaceId: businessId, decisions: [], deliveries: [], deliveryChecks: [], changes: [{ id: businessId, systemId, title: "Updated the intake", at: "2026-10-12T12:00:00Z", actor }] });
    const html = renderToStaticMarkup(<AgencyClientChanges state={{ status: "ready", data }} workspaceId={businessId} onRetry={() => {}} />);
    expect(html).toContain(label);
    if (actor && "displayName" in actor && actor.displayName) expect(html).not.toContain("Actor not recorded");
  });
  it("names the business, serving agency and original proposer on a shared Possibility", () => {
    const html = renderToStaticMarkup(<PossibilityTry state={{ kind: "ready", view: { title: "Consult booking", intent: "Try a booking page", businessName: "Harbor Dental", agencyBrand: brand, proposingActor: { kind: "agency", displayName: "Original Studio" }, changes: [], introduces: [], takesSubmissions: false } }} />);
    for (const label of ["Harbor Dental", "North Studio", "Proposed by Original Studio", XA_YES_LABELS.yes]) expect(html).toContain(label);
    expect(html).not.toContain("not recorded");
  });
  it("does not infer a proposer from the serving agency", () => {
    const html = renderToStaticMarkup(<PossibilityTry state={{ kind: "ready", view: { title: "Consult booking", intent: "Try a booking page", businessName: "Harbor Dental", agencyBrand: brand, changes: [], introduces: [], takesSubmissions: false } }} />);
    expect(html).toContain("Who proposed this wasn’t recorded");
    expect(html).not.toContain("Proposed by North Studio");
  });
  it("keeps the recorded recipient and filer in an Ask receipt", () => {
    const result = readAskResult({ kind: "request", items: [{ kind: "request", toolId: "create_request", status: "filed", ids: [businessId], summary: "A consult page", agencyName: "Original Studio", actor: { kind: "person", displayName: "Jo" } }] })!;
    expect(receiptLines(result)[0]!.text).toContain("Request filed for Original Studio");
    expect(receiptLines(result)[0]!.text).toContain("Filed by Jo");
    const unknown = readAskResult({ kind: "request", items: [{ kind: "request", toolId: "create_request", status: "filed", ids: [], actor: { kind: "agency" } }] })!;
    expect(receiptLines(unknown)[0]!.text).not.toContain("Strelva");
  });
});
