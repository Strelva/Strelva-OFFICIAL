// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentWorkspace, type ContentWorkspaceData } from "@/experience/publishing/ContentWorkspace";
import { NewsletterSurface } from "@/experience/publishing/NewsletterSurface";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";
import { WorkspaceReviewsView } from "@/experience/places/WorkspaceReviews";
import { ReviewReplyForm } from "@/experience/places/ReviewReplyForm";
import { RecapOutcome, recapOutcomeSentences } from "@/experience/recaps/WorkspaceRecaps";
import { UnsubscribeView } from "@/experience/publishing/UnsubscribeView";
import { PUBLISHING_RECAP, PUBLISHING_RECAP_OUTCOME } from "@/experience/workspace/preview/publishing-fixture";
import { recapView } from "@/products/recaps/server";
import type { WeeklyBrief } from "@/lib/types";
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children }: { children: React.ReactNode }) => children }));

const workspaceId = "5e000000-0000-4000-8000-000000000010";
const initial = (): ContentWorkspaceData => ({ permissions: { canCompose: true, canApprove: true }, content: {
  sendingEnabled: false, entries: [], outputs: [], drafts: [{ id: "exact-draft", title: "Approve newsletter: The reviewed subject", body: "The reviewed words.", status: "pending" }],
} });
let root: ReturnType<typeof createRoot> | undefined;
async function mount(element: ReactElement) {
  const node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(element)); return node;
}
function button(node: HTMLElement, label: string) { const result = [...node.querySelectorAll("button")].find(item => item.textContent?.startsWith(label)); expect(result).toBeTruthy(); return result!; }
async function click(node: HTMLElement, label: string) { await act(async () => button(node, label).click()); }
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("publishing paper compositions preserve the commands", () => {
  it("saving approval sends the exact draft ID and retains the sending pause", async () => {
    const data = initial();
    const request = vi.fn<typeof fetch>(async (_url, options) => {
      if (options?.method === "POST") data.content.drafts[0]!.status = "approved";
      return Response.json(options?.method === "POST" ? { result: { changed: true } } : data);
    });
    const node = await mount(<ContentWorkspace workspaceId={workspaceId} systemId="exact-system" kind="newsletter" initial={data} request={request} />);
    expect(node.textContent).toContain("The reviewed words.");
    expect(node.textContent).toContain("no subscriber receives email");
    await click(node, "Save approved issue");
    expect(request).toHaveBeenCalledWith("/api/workspace/publishing/content", expect.objectContaining({ method: "POST", body: JSON.stringify({ workspaceId, systemId: "exact-system", action: "approve", eventId: "exact-draft" }) }));
    expect(node.textContent).toContain("Approved issue saved. Sending is paused; copy it into your email tool.");
    expect(node.textContent).not.toContain("Delivered successfully");
  });

  it("keeps the exact newsletter words on refusal and blocks another approval until reload", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ error: "Your account cannot approve." }, { status: 403 }));
    const node = await mount(<ContentWorkspace workspaceId={workspaceId} systemId="exact-system" kind="newsletter" initial={initial()} request={request} />);
    await click(node, "Save approved issue");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Your account cannot approve.");
    expect(node.textContent).toContain("The reviewed words.");
    expect(node.querySelector("button[aria-describedby]" )).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("read-only newsletter hides approval and compose, rather than inventing authority", () => {
    const html = renderToStaticMarkup(<ContentWorkspace workspaceId={workspaceId} systemId="s" kind="newsletter" initial={initial()} readOnly />);
    expect(html).toContain("Publishing is read only"); expect(html).not.toContain("Save approved issue"); expect(html).not.toContain("Compose an issue");
  });

  it("not yet retains the existing not_yet command", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json(initial()));
    const node = await mount(<ContentWorkspace workspaceId={workspaceId} systemId="s" kind="newsletter" initial={initial()} request={request} />);
    await click(node, "Not yet");
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ workspaceId, systemId: "s", action: "not_yet", eventId: "exact-draft" });
  });

  it("keeps reviewed reply text and the existing reply endpoint, including failure copy", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ error: "Denied" }, { status: 403 }));
    const node = await mount(<ReviewReplyForm workspaceId={workspaceId} tenantId="t" reviewId="r" author="Fixture reader" initial="Exact drafted reply" postsToGoogle request={request} />);
    expect(node.querySelector("textarea")).toBeNull();
    await click(node, "Edit");
    expect(node.querySelector("textarea")?.value).toBe("Exact drafted reply");
    await click(node, "Post reply");
    expect(request).toHaveBeenCalledWith("/api/workspace/reviews/reply", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify({ workspaceId, tenantId: "t", reviewId: "r", reply: "Exact drafted reply" }) }));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Your account can't reply");
    expect(node.querySelector("textarea")?.value).toBe("Exact drafted reply");
  });
});

describe("publishing distinguishes evidence and unavailable state", () => {
  it("never relabels suppressed recipients as bounces or unsubscribes", () => {
    const data = initial(); data.content.drafts = [];
    data.content.outputs = [{ id: "o", subject: "Last issue", body: "Saved words", approved_at: "2026-09-15", state: "approved", event_id: "e", accepted_count: 98, suppressed_count: 2, failure_count: 0, delivery: { state: "accepted", accepted: 98, suppressed: 2, unconfirmedBatches: 0, receipts: [] } }];
    const html = renderToStaticMarkup(<NewsletterSurface data={data} canApprove={false} busy={false} command={() => {}} />);
    const dom = document.createElement("div"); dom.innerHTML = html;
    const rows = [...dom.querySelectorAll("li")].map(row => row.textContent);
    expect(rows).toContain("BouncedNot available"); expect(rows).toContain("UnsubscribedNot available");
    expect(rows).toContain("Suppressed before sending2"); expect(html).toContain("delivery not verified"); expect(html).toContain("who read it");
  });

  it.each([true, false])("copies the exact approved newsletter or offers selectable text when clipboard access is %s", async allowed => {
    const data = initial(); data.content.drafts = [];
    data.content.outputs = [{ id: "o", subject: "Reviewed subject", body: "Exact approved words", approved_at: "2026-09-15", state: "approved", event_id: "e", accepted_count: 0, suppressed_count: 0, failure_count: 0 }];
    const writeText = vi.fn(async () => { if (!allowed) throw new Error("denied"); });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const node = await mount(<NewsletterSurface data={data} canApprove={false} busy={false} command={() => {}} />);
    await click(node, "Copy approved issue");
    expect(writeText).toHaveBeenCalledWith("Reviewed subject\n\nExact approved words");
    expect(node.textContent).toContain(allowed ? "Copying does not send email" : "select its text to copy");
    expect(node.querySelector("textarea")?.value).toBe("Reviewed subject\n\nExact approved words");
    expect(node.querySelector("textarea")?.readOnly).toBe(true);
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it("says outcome counts as sentences without turning customer clicks into bookings; recorded zero stays zero", () => {
    const html = renderToStaticMarkup(<RecapOutcome recap={PUBLISHING_RECAP} siteName="Fixture site" />);
    // A count that wasn't saved is left out, never shown as zero and never contradicted by a "not counted" line.
    expect(html).not.toContain("Not counted"); expect(html).not.toContain("booked.");
    expect(html).toContain("aren&#x27;t confirmed bookings or answered calls");
    const fixture = renderToStaticMarkup(<RecapOutcome recap={PUBLISHING_RECAP} siteName="Fixture site" outcome={PUBLISHING_RECAP_OUTCOME} />);
    expect(fixture).not.toContain("Not counted");
    expect(recapOutcomeSentences(PUBLISHING_RECAP, { ...PUBLISHING_RECAP_OUTCOME, reviews: 0 })).toContain("No new reviews.");
    expect(recapOutcomeSentences(PUBLISHING_RECAP, { inquiries: 0, answered: 0, bookings: 0, reviews: 0 })).toEqual(expect.arrayContaining(["Nobody asked a question through the site.", "0 visits booked."]));
  });

  it("uses already saved inquiry proof and review events without claiming bookings, delivery or a review provider", () => {
    const brief: WeeklyBrief = { id: "saved", tenantId: "fixture", weekStart: "2026-09-28", weekEnd: "2026-10-04", summary: "", highlights: [], topServices: [], topSearchQueries: [], staleSections: [], createdAt: "2026-10-05", stats: { pageViews: 200, pageViewsDelta: 0, bookingClicks: 7, bookingClicksDelta: 0, contentUpdates: 0, reviewsReceived: 0, inquiryOutcomeProof: { status: "available", inquiries: 4, answered: 3, withinDay: 2, unanswered: 1, averageReplySeconds: null, medianReplySeconds: null, evidence: "Saved proof" } } };
    const view = recapView(brief);
    expect(view.inquiryOutcome).toBe(brief.stats.inquiryOutcomeProof); expect(view.newReviews).toBe(0);
    const html = renderToStaticMarkup(<RecapOutcome recap={view} siteName="Fixture site" />);
    expect(html).toContain("4 people asked a question, and Strelva or you replied to 3, 2 within a day.");
    expect(html).not.toContain("got an answer"); expect(html).not.toContain("Google"); expect(html).not.toContain("booked");
    expect(html).not.toMatch(/delivery not verified|provider isn|Recorded form submissions/);
    const unavailable = renderToStaticMarkup(<RecapOutcome recap={recapView({ ...brief, stats: { ...brief.stats, inquiryOutcomeProof: { status: "unavailable", reason: "Read failed" } } })} siteName="Fixture site" />);
    expect(unavailable.match(/couldn&#x27;t be counted when this recap was saved/g)).toHaveLength(1);
    expect(recapView({ ...brief, stats: { ...brief.stats, inquiryOutcomeProof: undefined } }).inquiryOutcome).toBeUndefined();
  });

  it.each(["loading", "permission", "error"] as const)("Google and reviews have a %s state without leaking data", kind => {
    const google = renderToStaticMarkup(<WorkspaceGoogle workspaceId={workspaceId} state={{ kind }} action={async () => {}} />);
    const reviews = renderToStaticMarkup(<WorkspaceReviewsView workspaceId={workspaceId} state={{ kind }} />);
    for (const html of [google, reviews]) { expect(html).not.toContain("Prepare hours"); expect(html).not.toContain("Post reply"); expect(html).toContain(kind === "loading" ? "Loading" : kind === "permission" ? "another business" : "couldn&#x27;t load"); }
  });

  it("pending Google access disables writes and retains exact command context and receipts", () => {
    const html = renderToStaticMarkup(<WorkspaceGoogle workspaceId={workspaceId} action={async () => {}} state={{ kind: "ready", data: [{ tenantId: "exact-tenant", locationId: "exact-location", name: "Fixture listing", connected: true, canManage: true, control: { workspaceId, locationId: "exact-location", accessPending: true, paused: false, updatedAt: null }, drafts: [{ id: "exact-event", title: "Hours", body: "Closed" }], receipts: [] }] }} />);
    const dom = document.createElement("div"); dom.innerHTML = html;
    // The one yes: its form carries the exact event, listing and decision.
    const approve = dom.querySelector<HTMLButtonElement>("button[data-xa-primary]");
    expect(approve?.disabled).toBe(true);
    expect(approve?.form?.querySelector<HTMLInputElement>('input[name="action"]')?.value).toBe("approve");
    expect(approve?.form?.querySelector<HTMLInputElement>('input[name="locationId"]')?.value).toBe("exact-location");
    expect(approve?.form?.querySelector<HTMLInputElement>('input[name="eventId"]')?.value).toBe("exact-event");
    expect(html).toContain("No Google changes have been sent yet");
  });

  it("real-looking unsubscribe success has no undo unless its caller has supplied an action", () => {
    const html = renderToStaticMarkup(<UnsubscribeView state="ready" />);
    expect(html).toContain("unsubscribed"); expect(html).not.toContain("Undo");
    for (const state of ["loading", "error", "permission", "empty"] as const) expect(renderToStaticMarkup(<UnsubscribeView state={state} />)).not.toContain("Undo");
  });
});
