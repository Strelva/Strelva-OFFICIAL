import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { askHistoryFailure, askErrorMessage, readAskResult, readAskSuggestions, receiptLines, resultHeadline, sameAppPath } from "@/experience/ask/ask-model";
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
    expect(receiptLines(result)).toEqual([{ key: expect.any(String), tone: "waiting", text: "Drafted: Homepage hero. Waiting on the owner, on their Home. Nothing is live until they say yes.", decideHref: "/dashboard/review", ref: "evt_1" }]);
  });

  it("names each of the four results honestly", () => {
    const request = readAskResult({ kind: "request", items: [{ kind: "request", toolId: "create_request", status: "filed", ids: ["r1"], summary: "A private events page" }] })!;
    expect(receiptLines(request)[0]!.text).toBe("Request filed: A private events page. It's at Asked; scope and timing are agreed with you next.");
    expect(receiptLines(request)[0]!.text).not.toMatch(/accepted/i);
    const possibility = readAskResult({ kind: "possibility", items: [{ kind: "possibility", toolId: "open_possibility", status: "opened", ids: ["p1"], summary: "Consult booking · Draft" }] })!;
    expect(receiptLines(possibility)[0]!.text).toBe("I made Consult booking. Nothing is on until it's turned on.");
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
    expect(html).toContain("What should change for Great Lakes Dried Fruit?");
    expect(html).toContain("Nothing goes public without the owner&#x27;s yes.");
    expect(html).toContain("What does greatlakesdriedfruit.com do today?");
    expect(html).not.toContain("estate planning");
    expect(html).not.toContain("holiday gift boxes");
    // The rule is said once, beside the change it protects; never as a line under every thread.
    expect(html).not.toContain("Saying yes in this conversation never approves anything.");
    expect(html).toContain("Loading conversations");
    expect(html).not.toMatch(/\b(AI|agent|automation|workflow)\b/);
  });

  it("lets an operator record email or phone origin without moving the decision into chat", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "The Mooney Firm", canAskOnBehalf: true }));
    expect(html).toContain("Who asked for this?");
    expect(html).toContain("The owner, by email");
    expect(html).toContain("The owner, by phone");
    expect(html).toContain("The owner still decides, on Home.");
    const owner = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "The Mooney Firm" }));
    expect(owner).not.toContain("Who asked for this?");
  });

  it("disables asking with the reason when the person can't ask", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "The Mooney Firm", readOnly: true, readOnlyReason: "Work in this business has stopped.", request: (async () => new Response("{}")) as typeof fetch }));
    expect(html).toContain('placeholder="Work in this business has stopped."');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
});

describe("Ask continuations", () => {
  it("keeps exact Try links in streamed and historical Possibility receipts", () => {
    const item = { kind: "possibility", status: "opened", toolId: "open_possibility", ids: ["p1"], summary: "Services", previewHref: "/api/websites/draft/preview?revision=1", tryHref: "/try/signed-revision", needsYou: { route: "owner_decides", itemRef: "p1", decideAt: `/workspace?workspaceId=${WS}&view=needs-you` } };
    for (const raw of [{ ask: { kind: "possibility", items: [item], saved: true } }, { kind: "possibility", items: [item], saved: true }]) {
      const result = readAskResult(raw)!;
      expect(receiptLines(result)[0]).toMatchObject({ openHref: "/try/signed-revision", openLabel: "Try it" });
      const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", decider: { name: "you", you: true }, initialMessages: [{ id: "p", role: "assistant", content: "Ready to try.", result }] }));
      expect(html).toContain('href="/try/signed-revision"');
      expect(html).toMatch(new RegExp(`href="/workspace\\?workspaceId=${WS}&amp;view=needs-you"[^>]*>Turn it on<`));
      expect(html).toContain("Nothing is on until you turn it on.");
    }
  });
  it.each(["https://evil.example/try", "//evil.example/try", "/\\evil.example", "/try/../../outside", "/try/\nunsafe"])("drops unsafe candidate links %s", tryHref => {
    const result = readAskResult({ kind: "possibility", items: [{ kind: "possibility", status: "opened", tryHref }] })!;
    expect(receiptLines(result)[0]?.openHref).toBeUndefined();
  });
  it("uses the native preview when an isolated Try link is unavailable", () => {
    const result = readAskResult({ kind: "possibility", items: [{ kind: "possibility", status: "opened", previewHref: "/api/websites/draft/preview?revision=1" }] })!;
    expect(receiptLines(result)[0]).toMatchObject({ openHref: "/api/websites/draft/preview?revision=1", openLabel: "Open preview" });
  });
  it("gives a paused turn one agency step and never calls it an answer", () => {
    const result = readAskResult({ kind: "refusal", saved: true, items: [{ kind: "refusal", status: "refused", toolId: "classifier", summary: "budget_paused" }] })!;
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", initialMessages: [{ id: "pause", role: "assistant", content: "Building is paused.", result }] }));
    expect(html).toContain("Bring in an agency");
    expect(html).toContain(`workspaceId=${WS}&amp;view=help`);
    expect(html).not.toContain("Answered from what Strelva read");
  });
  it("uses only the server's bounded configured-plan target for a budget pause", () => {
    const result = readAskResult({ kind: "refusal", saved: true, budgetRecovery: "plan", items: [{ kind: "refusal", status: "refused", summary: "budget_paused" }] })!;
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", initialMessages: [{ id: "pause", role: "assistant", content: "Choose a plan to continue.", result }] }));
    expect(html).toContain(`href="/workspace/billing?workspaceId=${WS}"`);
    expect(html).toContain("Choose a plan");
    expect(html).not.toContain("Bring in an agency");
    expect(readAskResult({ kind: "refusal", budgetRecovery: "https://evil.example" })?.budgetRecovery).toBeUndefined();
  });
  it("rejects malformed or excessive server prompts", () => {
    expect(readAskSuggestions(["Good prompt"])).toEqual(["Good prompt"]);
    for (const raw of [[], [""], ["x".repeat(301)], ["a", "b", "c", "d"], ["bad\nprompt"], [123], null]) expect(readAskSuggestions(raw)).toBeNull();
  });
});

it("distinguishes a paused Ask release from unavailable conversation storage", () => {
  expect(askHistoryFailure(503, { error: "Ask Strelva is not enabled." })).toBe("off");
  expect(askHistoryFailure(503, { error: "The operation could not be confirmed." })).toBe("unavailable");
  expect(askHistoryFailure(503, null)).toBe("unavailable");
  expect(askHistoryFailure(403, { error: "Ask Strelva is not enabled." })).toBe("unavailable");
});


describe("saved website creation action", () => {
  const href = `/workspace/business/new/website?workspaceId=${WS}&conversationId=${SYSTEM}&messageId=aaaaaaaa-0000-4000-8000-000000000002`;
  const action = { kind: "website", label: "Prepare a website", href };
  it("keeps the same bounded link in streamed and reopened historical results", () => {
    for (const raw of [{ ask: { kind: "answer", items: [], creationAction: action } }, { kind: "answer", items: [], creationAction: action }]) {
      const result = readAskResult(raw)!;
      expect(result.creationAction).toEqual(action);
      const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Juniper", initialMessages: [{ id: "historical", role: "assistant", content: "Your website ask is saved.", result }] }));
      expect(html).toContain(`href="${href.replaceAll("&", "&amp;")}"`);
      expect(html).toContain("Prepare a website");
    }
  });
  it.each([
    "https://evil.example" + href,
    "/workspace/business/new/website-other?workspaceId=" + WS,
    href + "&request=private-words",
    href + "&workspaceId=" + WS,
    href + "#outside",
    href.replace(WS, "not-a-uuid"),
    href.replace("messageId=", "messageId=&other="),
    href.replace("/workspace/", "/workspace/../workspace/"),
  ])("ignores unsafe continuation %s without dropping the answer", invalid => {
    expect(readAskResult({ kind: "answer", creationAction: { ...action, href: invalid } })).toMatchObject({ kind: "answer" });
    expect(readAskResult({ kind: "answer", creationAction: { ...action, href: invalid } })?.creationAction).toBeUndefined();
  });
  it.each([{ ...action, kind: "publish" }, { ...action, label: "" }, { ...action, label: "x".repeat(121) }])("ignores unsupported or unbounded action metadata", invalid => {
    expect(readAskResult({ kind: "answer", creationAction: invalid })?.creationAction).toBeUndefined();
  });
});


describe("saved booking action parser",()=>{
 it("carries booking creation but refuses a website path disguised as booking",()=>{
  const query=new URLSearchParams({workspaceId:"ab200000-0000-4000-8000-000000000002",conversationId:"ab200000-0000-4000-8000-000000000003",messageId:"ab200000-0000-4000-8000-000000000004"});
  const creationAction={kind:"booking",label:"Prepare bookings",href:`/workspace/business/new/booking?${query}`};
  expect(readAskResult({kind:"answer",items:[],creationAction})?.creationAction).toEqual(creationAction);
  expect(readAskResult({kind:"answer",items:[],creationAction:{...creationAction,href:`/workspace/business/new/website?${query}`}})?.creationAction).toBeUndefined();
 });
});
