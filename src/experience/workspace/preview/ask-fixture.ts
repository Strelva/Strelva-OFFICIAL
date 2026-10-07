/**
 * Local preview of Ask Strelva: fictional conversations and a scripted
 * stream in the route's line protocol. Nothing is sent to a model, no
 * Request is filed and nothing is drafted. `mode` picks the state to review:
 * on (working), off (release off), error (Strelva can't answer), forbidden
 * (no access), unsaved (history down).
 */
export type AskPreviewMode = "on" | "off" | "error" | "forbidden" | "unsaved";

export function previewAskMode(value: string | undefined): AskPreviewMode | null {
  return value === "on" || value === "off" || value === "error" || value === "forbidden" || value === "unsaved" ? value : null;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const CONVERSATION = "a5000000-0000-4000-8000-000000000001";

function streamOf(lines: string[], delayMs = 120): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      controller.close();
    },
  }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function scripted(text: string, workspaceId: string, systemId: string | null, saved: boolean): string[] {
  const words = text.toLowerCase();
  const result = (ask: Record<string, unknown>) => `\n__RESULT__${JSON.stringify({ status: "queued", ask: { systemId, conversationId: saved ? CONVERSATION : null, saved, ...ask } })}\n`;
  if (/approve|publish it|yes/.test(words)) {
    return ["I can't approve anything from the conversation. Approve it in Needs you, or from the link in your email, so the approval stays tied to that exact change.", result({ kind: "refusal", items: [{ kind: "refusal", toolId: "classifier", status: "refused", ids: [], summary: "approval_in_chat" }] })];
  }
  if (/booking|private events|new page/.test(words)) {
    return ["__TOOL__Checking your Requests...\n", "Strelva runs your site, so I filed this for Strelva: ", "\"A private events page\". It's at Asked. ", "Strelva will agree scope and timing with you next. Nothing on your site changed.",
      result({ kind: "request", items: [{ kind: "request", toolId: "create_request", status: "filed", ids: ["c7a1e0b2-0000-4000-8000-000000000009"], summary: "A private events page on the site" }] })];
  }
  if (/top|hero|holiday|change|add/.test(words)) {
    return ["__TOOL__Reading your site...\n", "Your homepage hero says \"Dried fruit, done right\".\n", "__TOOL__Drafting the change...\n", "I drafted the holiday gift boxes as the homepage hero until December 20. ", "It isn't live. Adding a dated promotion needs your yes, so it's in Needs you.",
      result({ kind: "draft", items: [{ kind: "draft", toolId: "draft_website_change", status: "queued", ids: ["evt_hero_8812"], summary: "Homepage hero: holiday gift boxes until Dec 20", needsYou: { route: "owner_decides", itemRef: "evt_hero_8812", decideAt: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` } }] })];
  }
  return ["__TOOL__Reading your site...\n", "From your business record, updated Oct 3: you're open Monday to Friday, 9 to 5, ", "and Saturday 10 to 2.", result({ kind: "answer", items: [] })];
}

export function withAskPreview(base: typeof fetch, mode: AskPreviewMode | null, canAskOnBehalf = false): typeof fetch {
  if (!mode) return base;
  const stored: Array<{ id: string; role: "user" | "assistant"; content: string; result: unknown; askedOnBehalf: null }> = [
    { id: "m1", role: "user", content: "What are our hours on the site?", result: null, askedOnBehalf: null },
    { id: "m2", role: "assistant", content: "From your business record, updated Oct 3: Monday to Friday, 9 to 5, and Saturday 10 to 2.", result: { kind: "answer", items: [], systemId: null }, askedOnBehalf: null },
  ];
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    const method = init?.method || "GET";
    if (url.pathname === "/api/workspace/ask") {
      if (mode === "off") return json({ error: "Ask Strelva is not enabled. Nothing changed." }, 503);
      if (mode === "forbidden") return json({ error: "This business is unavailable to your account." }, 403);
      if (method === "GET") {
        if (mode === "unsaved") return json({ error: "The operation could not be confirmed." }, 503);
        if (url.searchParams.get("conversationId")) return json({ conversation: { id: CONVERSATION, systemId: null, title: "What are our hours on the site?", mine: true, updatedAt: "2026-10-05T15:00:00Z", messages: stored } });
        return json({ canAskOnBehalf, conversations: [{ id: CONVERSATION, systemId: null, title: "What are our hours on the site?", messageCount: stored.length, mine: true, createdAt: "2026-10-05T15:00:00Z", updatedAt: "2026-10-05T15:00:00Z" }] });
      }
      if (mode === "error") return json({ error: "Strelva can't answer right now. Nothing was changed." }, 502);
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { workspaceId: string; systemId?: string; messages?: Array<{ content: string }> };
      return streamOf(scripted(body.messages?.at(-1)?.content ?? "", body.workspaceId, body.systemId ?? null, mode !== "unsaved"));
    }
    const response = await base(input, init);
    if (url.pathname !== "/api/workspace" || method !== "GET" || !response.ok) return response;
    const snapshot = await response.json() as { releases?: Record<string, unknown> };
    return json({ ...snapshot, releases: { systems: false, ...snapshot.releases, ask: mode !== "off" } });
  };
}
