import type { AskMessageView, AskTurnResult } from "@/experience/ask/ask-model";

/** Fictional canon conversations. No person, result or count here is a live business claim. */
export const OWNER_CONVERSATION_FRAMES = ["Y2Tn3F", "Q1IkY", "s7xyY", "T8pknG", "ABt1D", "HQ5yA", "YsBMM"] as const;
export type OwnerConversationFrame = typeof OWNER_CONVERSATION_FRAMES[number];
export type OwnerConversationState = "ready" | "empty" | "loading" | "error" | "permission";
export const OWNER_CONVERSATION_BUSINESS = "Fictional Firm";
export const OWNER_CONVERSATION_WORKSPACE = "b7000000-0000-4000-8000-000000000001";
export const OWNER_CONVERSATION_SITE = "/preview/strelva/owner-website-preview?fixture=1";

export const OWNER_CONVERSATIONS: Record<OwnerConversationFrame, { title: string; scope: string; ask: string; reply: string }> = {
  Y2Tn3F: { title: "Fees on the fees page", scope: "Fictional Firm", ask: "Show half-day and full-day fees on the fees page.", reply: "Done in this preview. Fees now show on the fees page." },
  Q1IkY: { title: "Session date scope", scope: "Mediation sessions", ask: "Let attorneys request a session date from the site.", reply: "Done in this preview. Attorneys can ask for a session date. Nothing gets booked until you confirm it." },
  s7xyY: { title: "Route inquiries", scope: "Inquiries", ask: "Send inquiries from the site to our owner, and follow up with the person.", reply: "On it. I'll show you before anything goes live." },
  T8pknG: { title: "HR intake", scope: "Mediation intake", ask: "Add an intake for HR teams who want workplace mediation.", reply: "Here's a Possibility. I started from Mediation intake and asked what an HR lead would know up front." },
  ABt1D: { title: "Facts on the rebuilt site", scope: "fictionalfirm.example", ask: "Show me the facts that need my confirmation.", reply: "The rebuilt site keeps its facts with their source quotes. Forty fixture claims need your confirmation. Here's the first." },
  HQ5yA: { title: "Holiday email to past clients", scope: "Fictional Firm", ask: "Email all my past clients a holiday discount on mediation.", reply: "I can't do that from here. These fixture inquiry addresses have no marketing consent. Start a newsletter people sign up for, or make this a Request with an agreed scope and date." },
  YsBMM: { title: "Help", scope: "Help", ask: "How do I let my assistant see requests but not change anything?", reply: "People & access offers Member, Admin and Owner. None is a read-only business role. Review those permissions before inviting your assistant; this workspace cannot grant the view-only access you asked for." },
};

function fixtureResult(): AskTurnResult {
  return { kind: "answer", items: [], systemId: null, conversationId: null, saved: true };
}

export function ownerConversationMessages(frame: OwnerConversationFrame, state: OwnerConversationState): AskMessageView[] {
  if (state === "empty") return [];
  const fixture = OWNER_CONVERSATIONS[frame];
  return [
    { id: "fixture-ask", role: "user", content: fixture.ask, result: null },
    { id: "fixture-result", role: "assistant", content: state === "loading" ? "Strelva is reading the saved preview…" : state === "error" ? "This saved result can’t be read right now. Nothing was changed." : fixture.reply, result: fixtureResult() },
  ];
}

/** All requests terminate here. This fixture never falls through to fetch. */
export function ownerConversationTransport(state: OwnerConversationState): typeof fetch {
  return async (_input, init) => {
    const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (state === "permission") return response({ error: "This business is unavailable to your account." }, 403);
    if (state === "error") return response({ error: "Strelva can't read this preview right now. Nothing was changed." }, 503);
    if (init?.method !== "POST") return response({ conversations: [] });
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { messages?: { content?: string }[] };
    const words = body.messages?.at(-1)?.content ?? "";
    const approval = /\byes\b|approv|publish/i.test(words);
    const ask = approval
      ? { ...fixtureResult(), kind: "refusal", items: [{ kind: "refusal", toolId: "classifier", status: "refused", ids: [], summary: "approval_in_chat" }] }
      : fixtureResult();
    const text = approval
      ? "Saying yes here doesn't publish or approve anything. Use the exact Needs you control after reviewing the change. Nothing was changed."
      : "This is a fictional conversation rehearsal. Your words are kept in this view only. No work was filed, sent or changed.";
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`${text}\n__RESULT__${JSON.stringify({ ask })}\n`)); controller.close(); } }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  };
}
