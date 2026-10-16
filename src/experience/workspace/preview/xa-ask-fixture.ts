import type { AskChangeOutcome, AskMessageView, AskTurnResult } from "@/experience/ask/ask-model";

/**
 * XA · AS1 to AS6 fixtures. Fictional people and businesses only (Harbor
 * Dental, Dr. Amy Lin, North Studio, Maya Okafor); nothing here is a live claim.
 */
export const XA_ASK_SCREENS = ["as1", "as2", "as3", "as4", "as5", "as6"] as const;
export type XaAskScreen = typeof XA_ASK_SCREENS[number];
export const XA_ASK_STATES = ["ready", "loading", "error", "readonly", "history-down", "declined", "failed"] as const;
export type XaAskState = typeof XA_ASK_STATES[number];

export const XA_ASK_WORKSPACE = "b7000000-0000-4000-8000-0000000000a5";
export const XA_ASK_SYSTEM = "b7000000-0000-4000-8000-0000000005a1";
export const XA_ASK_DRAFT_REF = "b7000000-0000-4000-8000-0000000005d1";
const BASE = "/preview/strelva/xa/xa5-ask";

export const XA_ASK_SUGGESTIONS = [
  "List the insurance you take on the website",
  "Say you're closed Dec 24 to Jan 1",
  "Make Book a visit easier to find on phones",
];

const INSURANCE = "Insurance we accept: Delta Dental · Cigna · MetLife · Guardian. Out of network with Aetna, and we still file your claim for you.";

function answer(extra: Partial<AskTurnResult> = {}): AskTurnResult {
  return { kind: "answer", items: [], systemId: XA_ASK_SYSTEM, conversationId: null, saved: true, ...extra };
}

function draftResult(): AskTurnResult {
  return { kind: "draft", systemId: XA_ASK_SYSTEM, conversationId: null, saved: true, items: [{
    kind: "draft", toolId: "draft_website_change", status: "drafted", ids: [XA_ASK_DRAFT_REF], summary: INSURANCE,
    actor: { kind: "agency", displayName: "North Studio" },
    needsYou: { route: "owner_decides", itemRef: XA_ASK_DRAFT_REF, decideAt: `${BASE}/as5?door=owner` },
  }] };
}

const ASKED: AskMessageView = { id: "as-1", role: "user", content: "List the insurance Harbor Dental takes on the website", result: null };
const QUESTION: AskMessageView = { id: "as-2", role: "assistant", content: "One question first. The new-patient form at harbordental.com/forms names three plans. Are these all of them?", result: answer({ question: {
  options: [{ label: "Delta Dental", source: "On the form" }, { label: "Cigna", source: "On the form" }, { label: "MetLife", source: "On the form" }],
  addLabel: "Add a plan the form doesn't have",
} }) };
const ANSWERED: AskMessageView = { id: "as-3", role: "user", content: "Those three, plus Guardian. Out of network for Aetna, but we still file claims.", result: null };
const DRAFTED: AskMessageView = { id: "as-4", role: "assistant", content: "Here it is on harbordental.com, right under Hours. Nothing else on the page moves. The menu gets an Insurance link.", result: draftResult() };

export function xaAskMessages(screen: XaAskScreen): AskMessageView[] {
  if (screen === "as1") return [];
  if (screen === "as6") return [
    { id: "s6-1", role: "user", content: "Patients should be able to text us to reschedule", result: null },
    { id: "s6-2", role: "assistant", content: "I made it as a Possibility, Text to reschedule. A patient texts a new number, Strelva asks what times work, and your front desk confirms it in Requests. It assumed three things: a new number so your main line stays a phone line, no moves inside your scheduling software, and texts after 5 get an answer the next morning.", result: {
      kind: "possibility", systemId: null, conversationId: null, saved: true, items: [{
        kind: "possibility", toolId: "open_possibility", status: "opened", ids: ["b7000000-0000-4000-8000-0000000006a1"], summary: "Text to reschedule · Draft",
        tryHref: `${BASE}/as6?door=owner&tried=1`,
        needsYou: { route: "owner_decides", itemRef: "b7000000-0000-4000-8000-0000000006a1", decideAt: `${BASE}/as6?door=owner` },
      }],
    } },
  ];
  const thread = [ASKED, QUESTION];
  if (screen === "as2") return thread;
  return [...thread, ANSWERED, DRAFTED];
}

/** AS5: what the decision record says, by the draft's ref. */
export function xaAskOutcomes(screen: XaAskScreen, state: XaAskState): Record<string, AskChangeOutcome> | undefined {
  if (screen !== "as5") return undefined;
  const asked = [
    { at: "2026-10-15T10:02:00", text: "Asked for the insurance list", by: { name: "Maya", kind: "agency" as const } },
    { at: "2026-10-15T10:09:00", text: "Answered one question", by: { name: "Maya", kind: "agency" as const } },
    { at: "2026-10-15T10:14:00", text: "Sent for a yes", by: { name: "Maya", kind: "agency" as const } },
  ];
  if (state === "declined") return { [XA_ASK_DRAFT_REF]: { state: "declined", outcome: null, decidedBy: "Dr. Lin", decidedAt: "2026-10-15T10:41:00", readBackAt: null, steps: [...asked, { at: "2026-10-15T10:41:00", text: "Said not yet", by: { name: "Dr. Lin", kind: "owner" } }] } };
  if (state === "failed") return { [XA_ASK_DRAFT_REF]: { state: "approved", outcome: "failed", decidedBy: "Dr. Lin", decidedAt: "2026-10-15T10:41:00", readBackAt: null, steps: [...asked,
    { at: "2026-10-15T10:41:00", text: "Said yes", by: { name: "Dr. Lin", kind: "owner" } },
    { at: "2026-10-15T10:42:00", text: "Tried to put it live; the page didn't take it", by: { name: "Strelva", kind: "strelva" } }] } };
  return { [XA_ASK_DRAFT_REF]: {
    state: "approved", outcome: "done", decidedBy: "Dr. Lin", decidedAt: "2026-10-15T10:41:00", readBackAt: "2026-10-15T10:43:00",
    steps: [...asked,
      { at: "2026-10-15T10:41:00", text: "Said yes", by: { name: "Dr. Lin", kind: "owner" } },
      { at: "2026-10-15T10:42:00", text: "Put it live", by: { name: "Strelva", kind: "strelva" } },
      { at: "2026-10-15T10:43:00", text: "Read it back on a phone and a laptop", by: { name: "Strelva", kind: "strelva" } }],
    facts: [["Version", "12 of harbordental.com"], ["Checks", "41 of 41 links work"]],
    minutes: { person: "Maya", value: 9, to: "Harbor Dental" },
  } };
}

/** Every request terminates here; nothing falls through to the network. */
export function xaAskTransport(screen: XaAskScreen, state: XaAskState): typeof fetch {
  return async (_input, init) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method !== "POST") {
      if (state === "history-down") return json({ error: "Storage unavailable." }, 500);
      return json({ conversations: [
        { id: "b7000000-0000-4000-8000-00000000c001", systemId: XA_ASK_SYSTEM, title: "Thanksgiving hours", messageCount: 4, mine: true, updatedAt: "2026-10-12T15:00:00Z" },
        { id: "b7000000-0000-4000-8000-00000000c002", systemId: XA_ASK_SYSTEM, title: "New cleaning prices", messageCount: 6, mine: false, updatedAt: "2026-10-09T15:00:00Z" },
      ], suggestions: XA_ASK_SUGGESTIONS });
    }
    if (state === "error") return json({ error: "Strelva can't answer right now. Nothing was changed." }, 503);
    const encoder = new TextEncoder();
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const slow = state === "loading" ? 2400 : 500;
    const ask = screen === "as2" ? answer({ question: QUESTION.result!.question }) : answer();
    const text = screen === "as2" ? QUESTION.content : "This is a fictional preview. Your words stay in this view; nothing was filed, sent or changed.";
    return new Response(new ReadableStream({ async start(controller) {
      controller.enqueue(encoder.encode("__TOOL__Reading harbordental.com\n"));
      await wait(slow);
      controller.enqueue(encoder.encode("__TOOL__Reading the new-patient form\n"));
      await wait(slow);
      controller.enqueue(encoder.encode("__TOOL_DONE__\n"));
      controller.enqueue(encoder.encode(`${text}\n__RESULT__${JSON.stringify({ ask })}\n`));
      controller.close();
    } }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  };
}
