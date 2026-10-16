// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_FACTS, PREVIEW_NOTE, PREVIEW_BRAND, PREVIEW_SNAPSHOT, PREVIEW_RELEASES } from "@/experience/care-reports/preview-fixture";
import { renderCareReportMail } from "@/platform/care-reports/mail";
import { careCheckException, careCheckReason, careLead, careMattered, careOtherChanges, careSiteCheckSentence } from "@/platform/care-reports/model";
import { CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { deliveryPebble, SiteDeliveryStatus } from "@/experience/operations/SiteDeliveryStatus";
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
  it("keeps the agency's subject, carries the agency's note as its own words, and has no idle clay line-up", () => {
    const { subject, html, text } = mail();
    expect(subject).toBe("North Studio: Harbor Dental · September 2026 report");
    expect(html).not.toMatch(/<img|lineup|Pebble and/);
    expect(html).toContain("North Studio's note");
    expect(html).toContain(PREVIEW_NOTE);
    expect(text).toContain(PREVIEW_NOTE);
    expect(html).toContain("Open the report");
  });
  it("leads with one sentence, then one change that mattered with its date and a link to its System", () => {
    const { html, text, preheader } = mail();
    expect(html).not.toContain("font-size:64px");
    expect(html).toContain("North Studio made 3 changes.");
    expect(preheader).toBe("North Studio made 3 changes.");
    expect(html).toContain("The change that mattered");
    expect(html).toContain("North Studio: Moved the Book a visit button near the top of the home page.");
    // Its date, then "See it" to the website System (never the report link the primary opens).
    const system = "https://app.example.test/workspace?view=system&amp;system=5e000000-0000-4000-8000-0000000000e0&amp;workspaceId=5e000000-0000-4000-8000-0000000000b0";
    expect(html).toContain(`Sep 11 · </span><a href="${system}"`);
    expect(text).toContain("North Studio: Moved the Book a visit button near the top of the home page. (Sep 11)");
    expect(text).toContain("See it: https://app.example.test/workspace?view=system&system=");
    expect(html.match(/href="https:\/\/app\.example\.test\/r"/g)).toHaveLength(1);
  });
  it("lists the change that mattered once, and hides Release numbers from the owner", () => {
    const { html, text } = mail();
    expect(html.split("Book a visit button near the top").length - 1).toBe(1);
    expect(html).toContain("Also changed");
    expect(html).toContain("Put the fall hours on the website and Google.");
    expect(`${html}${text}`).not.toMatch(/Release \d|above the fold|Requests? done|Requests? is still/);
    expect(html).toContain("2 requests done:");
    expect(html).toContain("North Studio sent this when it shared Harbor Dental's September report.");
  });
  it("loads DM Sans the same way the paper emails do", () => {
    expect(mail().html).toContain("fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600");
  });
  it("words the lead and the change that mattered from the facts, crediting the agency", () => {
    const facts = { month: "2026-09", changes: { total: 3, confirmed: 2, notConfirmed: 0, notChecked: 1, items: PREVIEW_FACTS.changes.items }, requests: { doneCount: 2, openCount: 1, askedCount: 3, done: [] } };
    expect(careLead(facts, "North Studio")).toEqual({ text: "North Studio made 3 changes.", quiet: "2 were checked on the live site." });
    expect(careLead({ ...facts, changes: { ...facts.changes, total: 0, confirmed: 0, items: [] } }, "North Studio")).toEqual({ text: "North Studio finished 2 requests.", quiet: "No Systems changed." });
    expect(careLead({ ...facts, changes: { ...facts.changes, total: 0, confirmed: 0, items: [] }, requests: { ...facts.requests, doneCount: 0 } }, "North Studio").text).toBe("No recorded work this month.");
    expect(careMattered({ changes: { ...facts.changes, items: [] } }, "North Studio")).toBeNull();
    // The newest checked change, not the newer one nobody checked yet, and never the note.
    const mattered = careMattered(facts, "North Studio")!;
    expect(mattered.at).toBe("2026-09-11T16:00:00+00:00");
    expect(mattered.text).toBe("North Studio: Moved the Book a visit button near the top of the home page.");
    expect(careOtherChanges(facts, mattered).map(item => item.at)).toEqual(["2026-09-04T14:00:00+00:00", "2026-09-19T10:00:00+00:00"]);
  });
  it("says why a change wasn't checked and what clears it", () => {
    const { html, text } = mail();
    expect(html).toMatch(/Not checked: Strelva doesn(&#39;|')t check this kind of change on the live site\. Open the page to see it\./);
    expect(text).toContain("(Not checked: Strelva doesn't check this kind of change on the live site. Open the page to see it.)");
    expect(careCheckReason({ check: "confirmed", source: "website_deploy" }, "North Studio")).toBeNull();
    expect(careCheckReason({ check: "not_checked", source: "website_deploy" }, "North Studio")).toBe("No check of the live site has come back for this yet. Open the page to see it.");
    expect(careCheckReason({ check: "not_confirmed", source: "website_code" }, "North Studio")).toBe("The live site didn't show this change when Strelva looked. North Studio can publish it again.");
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
  const html = (audience: "owner" | "shared" | "agency") => renderToStaticMarkup(createElement(CareReportDocument, { snapshot: PREVIEW_SNAPSHOT, brand: PREVIEW_BRAND, releaseNumber: 2, audience, releases: PREVIEW_RELEASES, releaseHref: (n: number) => `/r/${n}` }));
  it("shows status only as the exception and keeps builder words out", () => {
    const page = html("owner");
    expect(page).toContain("Not checked");
    expect(page).not.toContain("Checked on the live site");
    expect(page).not.toMatch(/Ask Strelva and drafting|Strelva assistant|Release 6|Release 7|Release 8|harbordental\.example/);
    expect(page).toContain("harbordental.com passed all 30 checks.");
    expect(page).not.toContain("/xa/pose-lineup.webp");
    expect(page).toContain("The change that mattered");
    expect(page).toContain("Strelva doesn&#x27;t check this kind of change on the live site. Open the page to see it.");
    expect(page).toContain("North Studio&#x27;s note");
    expect(page).toContain("1 request is still open.");
    expect(page).not.toMatch(/above the fold|Requests? is still|No Requests/);
  });
  it("names the month and business once: the lead says only who did the work", () => {
    for (const audience of ["owner", "shared"] as const) {
      const page = html(audience);
      expect(page).toContain("North Studio made 3 changes.");
      expect(page).not.toContain("for Harbor Dental in September");
      expect(page, audience).not.toMatch(/Release \d|Earlier releases/);
    }
  });
  it("keeps Release numbers and earlier releases for the agency only", () => {
    const page = html("agency");
    expect(page).toContain("Harbor Dental · Release 2");
    expect(page).toContain("Earlier releases");
    expect(page).not.toContain("Earlier Releases");
    expect(page).toContain('href="/r/1"');
    expect(page).not.toContain('href="/r/2"');
  });
  it("credits the agency once on the shared page", () => {
    expect(html("shared")).not.toContain("Runs on Strelva");
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

  it("says where a website request is in one sentence and the last move, with no order-tracker steps", () => {
    const html = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "owner_review", submittedAt: "2026-11-09T15:00:00Z", updatedAt: "2026-11-18T19:30:00Z", maskedEmail: "am**@harbordental.com", agencyName: "North Studio" }));
    // No draft link on the record: the page never claims you can look at it here.
    expect(html).toContain("The draft is ready. North Studio is sending it to you by email.");
    expect(html).not.toContain("See the draft");
    expect(html).toContain("North Studio finished the draft on Nov 18. Nothing is published before you say yes.");
    const linked = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "owner_review", submittedAt: "2026-11-09T15:00:00Z", updatedAt: "2026-11-18T19:30:00Z", maskedEmail: "am**@harbordental.com", agencyName: "North Studio", draftUrl: "https://drafts.example.test/harbor" }));
    expect(linked).toContain("The draft is ready for you to look at.");
    expect(linked).toMatch(/data-xa-primary="true" href="https:\/\/drafts\.example\.test\/harbor">See the draft</);
    expect(linked.match(/data-xa-primary/g)).toHaveLength(1);
    expect(html).not.toMatch(/Request received|Checking it&#x27;s a fit|Ready to launch/);
    const received = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "received", submittedAt: "2026-11-09T15:00:00Z", maskedEmail: "am**@harbordental.com", agencyName: null }));
    expect(received).toContain("You sent the request on Nov 9.");
    expect(received).toContain("Your agency has your request and reads it next.");
  });
  it("names the agency on the no-account status page and stays neutral when it can't", () => {
    const named = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "drafting", submittedAt: "2026-10-09T15:00:00Z", maskedEmail: "am**@harbordental.com", agencyName: "North Studio" }));
    expect(named).toContain("North Studio");
    expect(named).toContain("Runs on Strelva");
    expect(named).toContain("North Studio is building the draft now.");
    expect(named).not.toMatch(/Step \d of \d/);
    expect(named).not.toContain("Strelva Agency");
    const neutral = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "paused", submittedAt: "2026-10-09T15:00:00Z", maskedEmail: "am**@harbordental.com", agencyName: null }));
    expect(neutral).not.toContain("Strelva Agency");
    expect(neutral).not.toContain("Runs on Strelva");
    expect(neutral).toContain("The work is on hold.");
    expect(neutral).toContain("Your agency paused it on Oct 9.".replace(" on Oct 9", ""));
  });
  it("gives Pebble a different job in each state, and names who to write to when it is paused", () => {
    const at = (status: "received" | "drafting" | "owner_review" | "paused") => renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status, submittedAt: "2026-11-09T15:00:00Z", updatedAt: "2026-11-18T19:30:00Z", maskedEmail: "am**@harbordental.com", agencyName: "North Studio", agencyEmail: "maya@northstudio.example" }));
    const statuses = ["received", "reviewing", "drafting", "owner_review", "launch_ready", "launched", "paused"] as const;
    expect(new Set(statuses.map(status => deliveryPebble(status, "North Studio", false))).size).toBe(statuses.length);
    const lines = (["received", "drafting", "owner_review", "paused"] as const).map(status => at(status));
    lines.forEach((page, index) => expect(page).toContain(deliveryPebble((["received", "drafting", "owner_review", "paused"] as const)[index]!, "North Studio", false).replace(/'/g, "&#x27;")));
    for (const page of lines) expect(page).not.toContain("You don&#x27;t need an account yet. When there is something");
    const paused = lines[3]!;
    expect(paused).toContain("North Studio paused it on Nov 18. No reason was recorded here.");
    expect(paused).toContain("Ask North Studio why it paused and what would start it again.");
    expect(paused).toContain('href="mailto:maya@northstudio.example?subject=Harbor%20Dental%20website%20request"');
  });
  it("never invents a date for a legacy record with no status time", () => {
    const legacy = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "drafting", submittedAt: "2026-11-09T15:00:00Z", updatedAt: "2026-11-09T15:00:00Z", maskedEmail: "am**@harbordental.com", agencyName: "North Studio" }));
    expect(legacy).toContain("North Studio started the draft.");
    expect(legacy).not.toMatch(/started the draft on/);
    const missing = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "drafting", submittedAt: "2026-11-09T15:00:00Z", updatedAt: null, maskedEmail: "am**@harbordental.com", agencyName: "North Studio" }));
    expect(missing).toContain("North Studio started the draft.");
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
