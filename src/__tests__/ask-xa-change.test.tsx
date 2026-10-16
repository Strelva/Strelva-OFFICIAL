// @vitest-environment jsdom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AskStrelva, type AskStrelvaProps } from "@/experience/ask/AskStrelva";
import { latestDraft, readAskResult, type AskChangeOutcome, type AskMessageView } from "@/experience/ask/ask-model";

const WS = "11111111-1111-4111-8111-111111111111";
const REF = "22222222-2222-4222-8222-222222222222";
const SHOWS = { placement: "Right under Hours", section: { heading: "Insurance we accept", lines: ["Delta Dental · Cigna"], note: "Out of network with Aetna." }, facts: [{ label: "Adds", value: "An Insurance section" }, { label: "Assumed", value: "The menu gets an Insurance link" }] };
const draft = (decideAt = `/workspace?workspaceId=${WS}`) => readAskResult({ kind: "draft", saved: true, items: [{ kind: "draft", toolId: "draft_website_change", status: "queued", ids: [REF], summary: "Insurance we accept", title: "Add your insurance to harbordental.com", shows: SHOWS, actor: { kind: "agency", displayName: "North Studio" }, needsYou: { route: "owner_decides", itemRef: REF, decideAt } }] })!;
const thread = (result = draft()): AskMessageView[] => [{ id: "u", role: "user", content: "List our insurance", result: null }, { id: "a", role: "assistant", content: "Here it is.", result, at: "2026-10-15T10:14:00" }];
const html = (props: Partial<AskStrelvaProps>) => renderToStaticMarkup(createElement(AskStrelva, { workspaceId: WS, businessName: "Harbor Dental", address: "harbordental.com", ...props }));
const count = (text: string, needle: string) => text.split(needle).length - 1;

async function mount(props: Partial<AskStrelvaProps>, request: typeof fetch) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(<AskStrelva workspaceId={WS} businessName="Harbor Dental" address="harbordental.com" request={request} {...props} />));
  return { node, async done() { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); } };
}

describe("Ask question (XA · AS2)", () => {
  it("reads a bounded question and drops malformed ones", () => {
    const ok = readAskResult({ kind: "answer", question: { options: [{ label: "Delta Dental", source: "On the form" }, { label: "Cigna" }], addLabel: "Add a plan" } });
    expect(ok?.question).toEqual({ options: [{ label: "Delta Dental", source: "On the form" }, { label: "Cigna", source: null }], addLabel: "Add a plan" });
    for (const question of [{ options: [] }, { options: [{ label: "" }] }, { options: [{ label: "a" }, { label: "a" }] }, { options: [{ label: "bad\nline" }] }, { options: Array.from({ length: 9 }, (_, i) => ({ label: `p${i}` })) }]) {
      expect(readAskResult({ kind: "answer", question })?.question).toBeUndefined();
    }
  });

  it("answers by sending an ordinary message with the picked options", async () => {
    const bodies: string[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") { bodies.push(String(init.body)); return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("Thanks.\n")); c.close(); } })); }
      return Response.json({ conversations: [] });
    });
    const question = readAskResult({ kind: "answer", saved: true, question: { options: [{ label: "Delta Dental" }, { label: "Cigna" }, { label: "MetLife" }] } })!;
    const view = await mount({ initialMessages: [{ id: "a", role: "assistant", content: "Are these all of them?", result: question }] }, request);
    try {
      const cigna = [...view.node.querySelectorAll("label")].find(label => label.textContent?.includes("Cigna"))!.querySelector("input")!;
      await act(async () => cigna.click());
      const use = [...view.node.querySelectorAll("button")].find(button => button.textContent === "Use these two")!;
      expect(use.hasAttribute("data-xa-primary")).toBe(true);
      await act(async () => use.click());
      expect(JSON.parse(bodies[0]!).messages.at(-1)).toEqual({ role: "user", content: "Use Delta Dental, MetLife." });
    } finally { await view.done(); }
  });

  it("keeps the words and offers Try again, saying they weren't sent", async () => {
    let posts = 0;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") { posts += 1; return Response.json({ error: "Strelva can't answer right now. Nothing was changed." }, { status: 503 }); }
      return Response.json({ conversations: [] });
    });
    const view = await mount({ initialMessages: thread() }, request);
    try {
      const box = view.node.querySelector("textarea")!;
      await act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!; set.call(box, "Add Guardian"); box.dispatchEvent(new Event("input", { bubbles: true })); });
      await act(async () => view.node.querySelector("form")!.requestSubmit());
      const alert = view.node.querySelector("[role=alert]")!;
      expect(alert.textContent).toContain("weren't sent");
      expect(box.value).toBe("Add Guardian");
      const retry = [...alert.querySelectorAll("button")].find(button => button.textContent === "Try again")!;
      await act(async () => retry.click());
      expect(posts).toBe(2);
    } finally { await view.done(); }
  });
});

describe("The drafted change beside the conversation (XA · AS3, AS4)", () => {
  it("finds the newest draft and stops at a newer non-draft result", () => {
    expect(latestDraft(thread())?.item.ids).toEqual([REF]);
    expect(latestDraft([...thread(), { id: "b", role: "assistant", content: "Filed.", result: readAskResult({ kind: "request", items: [{ kind: "request", status: "filed" }] }) }])).toBeNull();
  });

  it("shows the change as a section of the page, says it isn't public once, and names who sent it", () => {
    const page = html({ decider: { name: "Dr. Lin", you: false }, initialMessages: thread() });
    expect(page).toContain("Waits for Dr. Lin");
    expect(page).toContain("Insurance we accept");
    expect(page).toContain("Right under Hours");
    expect(page).toContain(">Added<");
    expect(page).toContain("The menu gets an Insurance link");
    expect(page).toContain("North Studio sent it to Dr. Lin");
    expect(page).toContain("From North Studio");
    expect(count(page, "Nothing is public")).toBe(1);
    expect(page).not.toContain("Saying yes in this conversation");
    expect(page).not.toContain("data-xa-primary");
    expect(page).not.toContain("Needs you");
  });

  it("titles what the owner sees by the change, not the domain", () => {
    const page = html({ decider: { name: "Dr. Lin", you: false }, initialMessages: thread(), initialChangeView: "sees" });
    expect(page).toContain("Add your insurance to harbordental.com");
    expect(page).toContain("Dr. Lin&#x27;s Today");
    expect(page).not.toContain("A change to harbordental.com");
  });

  it("gives the owner one way to the yes, and only a same-app one", () => {
    const page = html({ decider: { name: "you", you: true }, initialMessages: thread() });
    expect(count(page, "data-xa-primary")).toBe(1);
    expect(page).toContain("Review the change");
    expect(page).toContain(`href="/workspace?workspaceId=${WS}"`);
    const offsite = html({ decider: { name: "you", you: true }, initialMessages: thread(draft("https://evil.example/yes")) });
    expect(offsite).not.toContain("evil.example");
    expect(offsite).not.toContain("Review the change");
  });

  it("names the owner from the route when the caller doesn't", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ conversations: [], owner: { name: "Dr. Lin" } }));
    const view = await mount({ initialMessages: thread() }, request);
    try {
      expect(view.node.textContent).toContain("Waits for Dr. Lin");
      expect(view.node.textContent).not.toContain("the owner");
    } finally { await view.done(); }
  });

  it("makes the scope chip open a picker of places", async () => {
    const onScope = vi.fn();
    const request = vi.fn<typeof fetch>(async () => Response.json({ conversations: [] }));
    const view = await mount({ initialMessages: thread(), systemId: "33333333-3333-4333-8333-333333333333", systemName: "Website", systemState: "live",
      scopes: [{ id: null, label: "Harbor Dental" }, { id: "33333333-3333-4333-8333-333333333333", label: "Website", kind: "website" }], onScope }, request);
    try {
      const chip = view.node.querySelector<HTMLButtonElement>("button[aria-haspopup=listbox]")!;
      expect(chip.getAttribute("aria-label")).toContain("Change what this asks about");
      expect(chip.querySelector("[data-kind=live]")).not.toBeNull();
      await act(async () => chip.click());
      const options = [...view.node.querySelectorAll("[role=option]")];
      expect(options.map(option => option.textContent)).toEqual(["Harbor Dental", "WebsiteNow"]);
      await act(async () => (options[0] as HTMLButtonElement).click());
      expect(onScope).toHaveBeenCalledWith(null);
    } finally { await view.done(); }
  });
});

describe("After the decision (XA · AS5)", () => {
  const live: AskChangeOutcome = { state: "approved", outcome: "done", sentBy: "North Studio", sentAt: "2026-10-15T10:14:00", decidedBy: "Dr. Lin", decidedAt: "2026-10-15T10:41:00", liveBy: "Strelva", liveAt: "2026-10-15T10:43:00", readBackAt: "2026-10-15T10:43:00", reason: null, undo: "available" };
  const props = (outcome: AskChangeOutcome) => ({ decider: { name: "Dr. Lin", you: false }, initialMessages: thread(), outcomes: { [REF]: outcome } });

  it("leads with the outcome in one sentence naming each person, with every step one click away", () => {
    const page = html(props(live));
    expect(page).toContain("Live on harbordental.com.");
    expect(page).toContain("North Studio sent it at");
    expect(page).toContain("Strelva put it live and read it back at");
    expect(page).toContain("Show every step");
    expect(page).toContain("Read back at");
    expect(page).toContain(">Undo<");
    expect(page).not.toContain("Show the conversation\"><");
  });

  it("offers no Undo the receipt doesn't support, and says how to reverse it", () => {
    const page = html(props({ ...live, undo: "unavailable" }));
    expect(page).not.toContain(">Undo<");
    expect(page).toContain("ask Strelva to change it back");
  });

  it("says not yet once, and offers one next action", () => {
    const page = html(props({ ...live, state: "declined", outcome: null, liveBy: null, liveAt: null, readBackAt: null, undo: null }));
    expect(count(page, "said not yet")).toBe(1);
    expect(page).toContain("Ask for a change");
    expect(page).not.toContain("Live on harbordental.com.");
  });

  it("puts Pebble in frame for a failure, with one action, and never claims Live", () => {
    const page = html(props({ ...live, outcome: "failed", liveBy: null, liveAt: null, readBackAt: null, undo: null, reason: "the page changed after the draft was made" }));
    expect(page).toContain("didn&#x27;t go live");
    expect(page).toContain("the page changed after the draft was made");
    expect(page).toContain("Ask for help");
    expect(page).toContain("Pebble left harbordental.com as it was");
    expect(page).not.toContain("Live on harbordental.com.");
    expect(page).not.toContain("Read back at");
  });
});

describe("A new System (XA · AS6)", () => {
  const made = readAskResult({ kind: "possibility", saved: true, items: [{ kind: "possibility", toolId: "open_possibility", status: "opened", ids: ["p1"], summary: "Text to reschedule · Draft", title: "Text to reschedule",
    explain: { steps: ["A patient texts", "Strelva asks what times work"], assumed: ["A new number"], sample: { with: "Ana Ruiz", lines: [{ from: "them", text: "Can I move Thursday?" }, { from: "business", text: "Sure, what works?" }] } },
    tryHref: "/try/p1", needsYou: { route: "owner_decides", itemRef: "p1", decideAt: `/workspace?workspaceId=${WS}` } }] })!;
  const messages: AskMessageView[] = [{ id: "u", role: "user", content: "Let patients text to reschedule", result: null }, { id: "a", role: "assistant", content: "I made it as a new System.", result: made }];

  it("speaks owner words, shows how it works with one primary, and scopes the composer to the new System", () => {
    const page = html({ decider: { name: "you", you: true }, initialMessages: messages });
    expect(page).toContain("I made Text to reschedule. Nothing is on until you turn it on.");
    expect(page).toContain("What it assumed");
    expect(page).toContain("Ana Ruiz");
    expect(page).toContain("Sample conversation");
    expect(count(page, "data-xa-primary")).toBe(1);
    expect(page).toContain(">Turn it on<");
    expect(page).toContain("Change something");
    expect(page).toContain("Ask for a change to Text to reschedule");
    expect(page).not.toContain("Possibility");
    expect(page).not.toContain("Make it live is a separate step");
  });
});
