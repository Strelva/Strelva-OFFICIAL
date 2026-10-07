import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { askErrorMessage, readAskResult, receiptLines, resultHeadline, sameAppPath } from "@/experience/ask/ask-model";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { sectionFromView, sectionTitle } from "@/experience/app-frame/workspace-places";

const WS = "11111111-1111-4111-8111-111111111111";
const SYSTEM = "aaaaaaaa-0000-4000-8000-000000000001";

describe("Ask Strelva receipts", () => {
  it("reads the streamed result and says a draft is not live, with where it's decided", () => {
    const result = readAskResult({ status: "queued", ask: { kind: "draft", systemId: SYSTEM, conversationId: "c1", saved: true, items: [
      { kind: "draft", toolId: "draft_website_change", status: "queued", ids: ["evt_1"], summary: "Homepage hero", needsYou: { route: "owner_decides", itemRef: "evt_1", decideAt: "/dashboard/review" } },
    ] } })!;
    expect(result).toMatchObject({ kind: "draft", saved: true, conversationId: "c1" });
    expect(receiptLines(result)).toEqual([{ key: expect.any(String), tone: "waiting", text: "Drafted: Homepage hero. Waiting on the owner in Needs you. Nothing is live until they say yes.", decideHref: "/dashboard/review", ref: "evt_1" }]);
  });

  it("names each of the four results honestly", () => {
    const request = readAskResult({ kind: "request", items: [{ kind: "request", toolId: "create_request", status: "filed", ids: ["r1"], summary: "A private events page" }] })!;
    expect(receiptLines(request)[0]!.text).toBe("Filed for Strelva: A private events page. It's at Asked; scope and timing are agreed with you next.");
    expect(receiptLines(request)[0]!.text).not.toMatch(/accepted/i);
    const possibility = readAskResult({ kind: "possibility", items: [{ kind: "possibility", toolId: "open_possibility", status: "opened", ids: ["p1"], summary: "Consult booking · Draft" }] })!;
    expect(receiptLines(possibility)[0]!.text).toContain("Nothing live changed");
    const answer = readAskResult({ kind: "answer", items: [] })!;
    expect(receiptLines(answer)).toEqual([]);
    expect(resultHeadline(answer)).toBe("Answered from what Strelva read. Nothing changed.");
    const refusal = readAskResult({ kind: "refusal", items: [{ kind: "refusal", toolId: "classifier", status: "refused", ids: [], summary: "money" }] })!;
    expect(receiptLines(refusal)).toEqual([]);
    expect(resultHeadline(refusal)).toBeNull();
  });

  it("says a failure plainly and never offers a link that leaves the app", () => {
    const failed = readAskResult({ kind: "request", items: [{ kind: "request", toolId: "create_request", status: "failed", ids: [], summary: "Could not file the Request" }] })!;
    expect(receiptLines(failed)[0]).toMatchObject({ tone: "failed", text: "Couldn't be filed: Could not file the Request. Nothing was sent." });
    const offsite = readAskResult({ kind: "draft", items: [{ kind: "draft", toolId: "x", status: "queued", ids: [], summary: "s", needsYou: { route: "owner_decides", itemRef: null, decideAt: "https://evil.example/approve" } }] })!;
    expect(receiptLines(offsite)[0]!.decideHref).toBeUndefined();
    expect(sameAppPath("//evil.example")).toBeUndefined();
    expect(sameAppPath("/workspace?view=home")).toBe("/workspace?view=home");
  });

  it("treats malformed results as none", () => {
    expect(readAskResult(null)).toBeNull();
    expect(readAskResult({ ask: { kind: "publish_everything" } })).toBeNull();
    expect(readAskResult({ kind: "draft", items: [{ kind: "answer", status: "queued" }, { kind: "draft", status: "made_up" }] })!.items).toEqual([]);
  });

  it("turns route failures into next steps", () => {
    expect(askErrorMessage(503, "Ask Strelva is not enabled. Nothing changed.")).toBe("Ask Strelva isn't on for this business yet. Nothing was sent.");
    expect(askErrorMessage(429, null)).toBe("Too many requests. Try again in a minute.");
    expect(askErrorMessage(401, null)).toContain("Your words are still in the box");
    expect(askErrorMessage(403, null)).toBe("This business is unavailable to your account.");
  });
});

describe("Ask Strelva in the workspace", () => {
  it("is an addressable place that survives sign-in, on Home or about one System", () => {
    expect(sectionFromView("ask")).toBe("ask");
    expect(sectionTitle("ask")).toBe("Ask Strelva");
    expect(workspaceReturnTarget(`/workspace?workspaceId=${WS}&view=ask`)).toBe(`/workspace?workspaceId=${WS}&view=ask`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${WS}&view=ask&system=${SYSTEM}`)).toBe(`/workspace?workspaceId=${WS}&view=ask&system=${SYSTEM}`);
    expect(workspaceReturnTarget(`/workspace?workspaceId=${WS}&view=help&system=${SYSTEM}`)).toBeNull();
  });

  it("renders the empty state with examples and the no-approval rule", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Great Lakes Dried Fruit", systemId: SYSTEM, systemName: "greatlakesdriedfruit.com", request: (async () => new Response("{}")) as typeof fetch }));
    expect(html).toContain("About greatlakesdriedfruit.com.");
    expect(html).toContain("Put the holiday gift boxes at the top of the homepage");
    expect(html).toContain("Saying yes here never approves anything. Approvals happen in Needs you.");
    expect(html).toContain("Loading conversations");
    expect(html).not.toMatch(/\b(AI|agent|automation|workflow)\b/);
  });

  it("lets an operator record email or phone origin without moving the decision into chat", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "The Mooney Firm", canAskOnBehalf: true }));
    expect(html).toContain("Who asked for this?");
    expect(html).toContain("The owner, by email");
    expect(html).toContain("The owner, by phone");
    expect(html).toContain("The owner still decides in Needs you.");
    const owner = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "The Mooney Firm" }));
    expect(owner).not.toContain("Who asked for this?");
  });

  it("disables asking with the reason when the person can't ask", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "The Mooney Firm", readOnly: true, readOnlyReason: "Work in this workspace has stopped.", request: (async () => new Response("{}")) as typeof fetch }));
    expect(html).toContain('placeholder="Work in this workspace has stopped."');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
});
