// @vitest-environment jsdom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { latestDraft, readAskResult, type AskChangeOutcome, type AskMessageView } from "@/experience/ask/ask-model";

const WS = "11111111-1111-4111-8111-111111111111";
const REF = "22222222-2222-4222-8222-222222222222";
const draft = (decideAt = `/workspace?workspaceId=${WS}`) => readAskResult({ kind: "draft", saved: true, items: [{ kind: "draft", toolId: "draft_website_change", status: "drafted", ids: [REF], summary: "Insurance we accept", actor: { kind: "agency", displayName: "North Studio" }, needsYou: { route: "owner_decides", itemRef: REF, decideAt } }] })!;
const thread = (result = draft()): AskMessageView[] => [{ id: "u", role: "user", content: "List our insurance", result: null }, { id: "a", role: "assistant", content: "Here it is.", result }];

describe("Ask question (XA · AS2)", () => {
  it("reads a bounded question and drops malformed ones", () => {
    const ok = readAskResult({ kind: "answer", question: { options: [{ label: "Delta Dental", source: "On the form" }, { label: "Cigna" }], addLabel: "Add a plan" } });
    expect(ok?.question).toEqual({ options: [{ label: "Delta Dental", source: "On the form" }, { label: "Cigna", source: null }], addLabel: "Add a plan" });
    for (const question of [{ options: [] }, { options: [{ label: "" }] }, { options: [{ label: "a" }, { label: "a" }] }, { options: [{ label: "bad\nline" }] }, { options: Array.from({ length: 9 }, (_, i) => ({ label: `p${i}` })) }]) {
      expect(readAskResult({ kind: "answer", question })?.question).toBeUndefined();
    }
  });

  it("answers by sending an ordinary message with the picked options", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const bodies: string[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") { bodies.push(String(init.body)); return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("Thanks.\n")); c.close(); } })); }
      return Response.json({ conversations: [] });
    });
    const question = readAskResult({ kind: "answer", saved: true, question: { options: [{ label: "Delta Dental" }, { label: "Cigna" }, { label: "MetLife" }] } })!;
    const node = document.createElement("div"); document.body.append(node); const root = createRoot(node);
    try {
      await act(async () => root.render(<AskStrelva workspaceId={WS} businessName="Harbor Dental" request={request} initialMessages={[{ id: "a", role: "assistant", content: "Are these all of them?", result: question }]} />));
      const cigna = [...node.querySelectorAll("label")].find(label => label.textContent?.includes("Cigna"))!.querySelector("input")!;
      await act(async () => cigna.click());
      const use = [...node.querySelectorAll("button")].find(button => button.textContent === "Use these two")!;
      expect(use.hasAttribute("data-xa-primary")).toBe(true);
      await act(async () => use.click());
      expect(JSON.parse(bodies[0]!).messages.at(-1)).toEqual({ role: "user", content: "Use Delta Dental, MetLife." });
    } finally {
      await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals();
    }
  });
});

describe("The drafted change beside the conversation (XA · AS3, AS4)", () => {
  it("finds the newest draft and stops at a newer non-draft result", () => {
    expect(latestDraft(thread())?.item.ids).toEqual([REF]);
    expect(latestDraft([...thread(), { id: "b", role: "assistant", content: "Filed.", result: readAskResult({ kind: "request", items: [{ kind: "request", status: "filed" }] }) }])).toBeNull();
  });

  it("tells an agency person who it waits for, with no yes of their own", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", address: "harbordental.com", decider: { name: "Dr. Lin", you: false }, initialMessages: thread() }));
    expect(html).toContain("Waits for Dr. Lin");
    expect(html).toContain("harbordental.com");
    expect(html).toContain("Nothing is public until Dr. Lin says yes.");
    expect(html).toContain("From North Studio");
    expect(html).not.toContain("data-xa-primary");
    expect(html).not.toContain("Review the change");
  });

  it("gives the owner one way to the yes, and only a same-app one", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", decider: { name: "you", you: true }, initialMessages: thread() }));
    expect(html.match(/data-xa-primary/g)).toHaveLength(1);
    expect(html).toContain("Review the change");
    expect(html).toContain(`href="/workspace?workspaceId=${WS}"`);
    const offsite = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", decider: { name: "you", you: true }, initialMessages: thread(draft("https://evil.example/yes")) }));
    expect(offsite).not.toContain("evil.example");
    expect(offsite).not.toContain("Review the change");
  });
});

describe("After the decision (XA · AS5)", () => {
  const outcome: AskChangeOutcome = { state: "approved", outcome: "done", decidedBy: "Dr. Lin", decidedAt: "2026-10-15T10:41:00", readBackAt: "2026-10-15T10:43:00",
    steps: [{ at: "2026-10-15T10:14:00", text: "Sent for a yes", by: { name: "Maya", kind: "agency" } }, { at: "2026-10-15T10:42:00", text: "Put it live", by: { name: "Strelva", kind: "strelva" } }] };
  it("names every step and whoever acted, and claims Live only from the record", () => {
    const html = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", address: "harbordental.com", decider: { name: "Dr. Lin", you: false }, initialMessages: thread(), outcomes: { [REF]: outcome } }));
    expect(html).toContain("Live on harbordental.com.");
    expect(html).toContain("Sent for a yes");
    expect(html).toContain("Maya");
    expect(html).toContain("Read back at");
    const failed = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", address: "harbordental.com", initialMessages: thread(), outcomes: { [REF]: { ...outcome, outcome: "failed", readBackAt: null } } }));
    expect(failed).toContain("didn&#x27;t go live");
    expect(failed).not.toContain("Live on harbordental.com.");
    const none = renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", initialMessages: thread() }));
    expect(none).not.toContain("Read back at");
  });
});
