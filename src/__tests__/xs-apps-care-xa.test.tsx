// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PREVIEW_FACTS, PREVIEW_NOTE, PREVIEW_BRAND, PREVIEW_SNAPSHOT, PREVIEW_RELEASES } from "@/experience/care-reports/preview-fixture";
import { CARE_REPORT_MAIL_ART, renderCareReportMail } from "@/platform/care-reports/mail";
import { careCheckException, careSiteCheckSentence } from "@/platform/care-reports/model";
import { CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { SiteDeliveryStatus } from "@/experience/operations/SiteDeliveryStatus";
import { DeliveryCommitmentPanel, deliverySentence } from "@/experience/operations/DeliveryCommitmentPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { readDeliveryPeople } from "@/platform/service-requests/delivery-people";
import { readinessSentence } from "@/experience/enterprise/HomeFinder";
import { toolChangeSentences } from "@/experience/applications/AgencyToolDraft";
import { CustomToolRequest } from "@/experience/custom-applications/CustomToolRequest";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { deliveryPeople, deliveryRequest, MAYA_ID, AMY_ID, REQUEST_ID } from "@/experience/workspace/preview/xs-apps-care-fixture";

const mail = (over: Partial<Parameters<typeof renderCareReportMail>[0]> = {}) => renderCareReportMail({ facts: PREVIEW_FACTS, agencyName: "North Studio", businessName: "Harbor Dental", release: 2, link: "https://app.example.test/r", agencyNote: PREVIEW_NOTE, ...over });

const roots: Root[] = [];
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.innerHTML = ""; });
async function mount(element: ReactElement) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return node;
}

describe("Care plan report email (XA · E3, template only)", () => {
  it("keeps the agency's subject, opens with Pebble and the Systems, and carries the agency's note", () => {
    const { subject, html, text } = mail();
    expect(subject).toBe("North Studio: Harbor Dental · September 2026 report");
    expect(html).toContain(`https://app.example.test${CARE_REPORT_MAIL_ART}`);
    // The art is a file the app actually serves, not a path that 404s in the inbox.
    expect(existsSync(join(process.cwd(), "public", CARE_REPORT_MAIL_ART))).toBe(true);
    expect(html).toContain("Pebble and Harbor Dental");
    expect(html).toContain(PREVIEW_NOTE);
    expect(text).toContain(PREVIEW_NOTE);
    expect(html).toContain("Open the report");
  });
  it("marks only the exception on a change and says the site checks in one sentence", () => {
    const { html, text } = mail();
    expect(html).not.toContain("Checked live");
    expect(html).toContain("Not checked");
    expect(html).toContain("harbordental.com passed all 30 checks.");
    expect(text).toContain("harbordental.com passed all 30 checks.");
    expect(text).not.toMatch(/Checked on the live site/);
  });
  it("uses DM Sans only, no monospace, no uppercase overlines, no em dashes", () => {
    const { html } = mail();
    expect(html).not.toMatch(/mono|courier|menlo/i);
    expect(html).not.toMatch(/text-transform:\s*uppercase/i);
    expect(html).not.toContain("—");
  });
  it("escapes what the agency typed and refuses unsafe links", () => {
    expect(mail({ agencyNote: "<script>x</script>" }).html).not.toContain("<script>x");
    expect(() => mail({ link: "javascript:alert(1)" })).toThrow();
  });
});

describe("Care plan report page", () => {
  const html = (audience: "owner" | "shared") => renderToStaticMarkup(createElement(CareReportDocument, { snapshot: PREVIEW_SNAPSHOT, brand: PREVIEW_BRAND, releaseNumber: 2, audience, releases: PREVIEW_RELEASES, releaseHref: (n: number) => `/r/${n}` }));
  it("shows status only as the exception and keeps builder words out", () => {
    const page = html("owner");
    expect(page).toContain("Not checked");
    expect(page).not.toContain("Checked on the live site");
    expect(page).not.toMatch(/Ask Strelva and drafting|Strelva assistant|Release 6|Release 7|Release 8|harbordental\.example/);
    expect(page).toContain("harbordental.com passed all 30 checks.");
    expect(page).toContain("/xa/pose-lineup.webp");
  });
  it("lists only truly earlier releases, in sentence case, and credits the agency once on the shared page", () => {
    const page = html("shared");
    expect(page).toContain("Earlier releases");
    expect(page).not.toContain("Earlier Releases");
    expect(page).toContain('href="/r/1"');
    expect(page).not.toContain('href="/r/2"');
    expect(page).not.toContain("Runs on Strelva");
  });
  it("words exceptions in two words", () => {
    expect(careCheckException("confirmed")).toBeNull();
    expect(careCheckException("not_checked")).toBe("Not checked");
    expect(careSiteCheckSentence({ hosted: { checks: 30, healthy: 28, lastCheckedAt: null }, readBacks: { confirmed: 0, notConfirmed: 0, notChecked: 0 }, latest: [{ host: "harbordental.com", state: "down", checkedAt: "2026-09-28T12:00:00Z" }] }, "Harbor Dental"))
      .toBe("harbordental.com passed 28 of 30 checks. harbordental.com was down when last checked, Sep 28.");
  });
});

describe("Hired work names who acts", () => {
  const item = { status: "requested" as const, providerAcceptance: { status: "accepted" as const, actorId: "a", acceptedAt: "2026-10-01T00:00:00Z", note: null } };
  it("says whose move it is, by name", () => {
    const submitted = { status: "submitted" } as Parameters<typeof deliverySentence>[0];
    expect(deliverySentence(submitted, item, "agency", Date.now(), { askedBy: "Dr. Amy Lin" })).toBe("Waiting on Dr. Amy Lin to review.");
    expect(deliverySentence(submitted, item, "business")).toBe("It's ready for you to look at.");
    const proposed = { status: "proposed" } as Parameters<typeof deliverySentence>[0];
    expect(deliverySentence(proposed, item, "business", Date.now(), { agency: "North Studio" })).toBe("North Studio sent the scope. It waits for your yes.");
  });

  it("names the agency on the no-account status page and stays neutral when it can't", () => {
    const named = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "drafting", submittedAt: "2026-10-09T15:00:00Z", maskedEmail: "am**@harbordental.com", agencyName: "North Studio" }));
    expect(named).toContain("North Studio");
    expect(named).toContain("Runs on Strelva");
    expect(named).toContain("Step 3 of 6");
    expect(named).not.toContain("Strelva Agency");
    const neutral = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "paused", submittedAt: "2026-10-09T15:00:00Z", maskedEmail: "am**@harbordental.com", agencyName: null }));
    expect(neutral).not.toContain("Strelva Agency");
    expect(neutral).not.toContain("Runs on Strelva");
    expect(neutral).toContain("Your agency will be in touch");
  });

  it("reads people and only counts the agency itself, never a seat on the business, as an agency operator", async () => {
    const request = deliveryRequest("submitted");
    const deps = { personName: vi.fn(async (id: string) => id === MAYA_ID ? "Maya Okafor" : id === AMY_ID ? "Dr. Amy Lin" : null), agencyName: vi.fn(async () => "North Studio"), agencyMember: vi.fn(async () => false) };
    await expect(readDeliveryPeople({ userId: AMY_ID, verifiedEmail: "amy@harbordental.com" }, request, deps)).resolves.toEqual({ askedBy: "Dr. Amy Lin", operator: "Maya Okafor", agency: "North Studio", viewerIsAgencyOperator: false });
    const failing = { ...deps, agencyMember: vi.fn(async () => { throw new Error("down"); }) };
    await expect(readDeliveryPeople({ userId: AMY_ID, verifiedEmail: "amy@harbordental.com" }, request, failing)).resolves.toMatchObject({ viewerIsAgencyOperator: false });
  });

  const panel = async (people: ReturnType<typeof deliveryPeople>, canOperate: boolean) => {
    const transport = (async () => new Response(JSON.stringify({ actorId: AMY_ID, request: deliveryRequest("submitted"), people, permissions: { canManage: !canOperate, canOperate, stopped: false, websiteBindings: [] } }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    return mount(createElement(WorkspaceRequestContext.Provider, { value: transport }, createElement(DeliveryCommitmentPanel, { requestId: REQUEST_ID })));
  };
  it("never shows the repository or commit to the owner, even if a role flag says operate", async () => {
    const owner = await panel(deliveryPeople(false), true);
    expect(owner.textContent).toContain("New-patient page");
    expect(owner.textContent).not.toContain("north-studio/harbor-dental");
    expect(owner.textContent).not.toContain("4f2a9c1");
    expect(owner.textContent).not.toContain("A person at the agency");
  });
  it("shows them to a member of the agency, and names who is doing it", async () => {
    const agency = await panel(deliveryPeople(true), true);
    expect(agency.textContent).toContain("north-studio/harbor-dental at 4f2a9c1");
    expect(agency.textContent).toContain("Maya Okafor at North Studio is doing it");
  });
  it("gives the owner one ink yes and asks for changes with a text link", async () => {
    const owner = await panel(deliveryPeople(false), false);
    expect(owner.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    expect(owner.textContent).toContain("Accept it");
    expect(owner.textContent).toContain("Ask for changes instead");
    expect(owner.textContent).not.toMatch(/Refresh saved state|Scope: |Agreed terms|Original deadline/);
  });
});

describe("Words for owners and agencies", () => {
  it("settles the yes on the GLOSSARY's Make it live", () => {
    expect(XA_YES_LABELS.yes).toBe("Make it live");
  });
  it("says one unmet Home Finder requirement as a sentence that names who acts", () => {
    expect(readinessSentence({ requirement: "Verified inquiry address", state: "unverified", source: "Lakeshore Homes", responsibleParty: "Brokerage" }, "Lakeshore Homes"))
      .toBe("Lakeshore Homes hasn't confirmed where inquiries go.");
  });
  it("says an internal tool change the way the owner will notice it", () => {
    const before = { title: "New-patient intake", maintenanceOwner: MAYA_ID, fields: [{ id: "name", label: "Patient name", type: "text" as const, required: true }], components: [{ kind: "form" as const, fields: ["name"] }] };
    const after = { ...before, fields: [...before.fields, { id: "insurance", label: "Insurance", type: "text" as const, required: true }, { id: "member", label: "Member ID", type: "text" as const, required: false }], components: [{ kind: "form" as const, fields: ["name", "insurance", "member"] }] };
    expect(toolChangeSentences(before, after, "Dr. Amy Lin")).toEqual(["Dr. Amy Lin sees two new questions on the form: “Insurance” and “Member ID”."]);
  });
  it("asks the owner to describe a tool, never for a build file", () => {
    const html = renderToStaticMarkup(createElement(CustomToolRequest, { workspaceId: AMY_ID, businessName: "Harbor Dental", agency: { id: MAYA_ID, name: "North Studio" }, requestsHref: "/r" }));
    expect(html).toContain("Send to North Studio");
    expect(html).not.toMatch(/build\.mjs|node:fs|\/output\/index\.html|writeFile/);
  });
});
