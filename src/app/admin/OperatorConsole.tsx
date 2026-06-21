"use client";

import { useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type ProposalAction =
  | "mint_pay_link"
  | "assign_user"
  | "approve_draft"
  | "reject_draft"
  | "update_tenant"
  | "run_scan"
  | "revoke_pay_link"
  | "send_invite";

interface Proposal {
  id: string;
  action: ProposalAction;
  summary: string;
  params: Record<string, unknown>;
}

type ProposalState = "pending" | "committing" | "done" | "error";

// The console — not the LLM — owns the action→endpoint mapping, so the agent
// can never target an arbitrary endpoint. Every endpoint gates + audits.
const COMMIT_MAP: Record<ProposalAction, { endpoint: string; method: string }> = {
  mint_pay_link: { endpoint: "/api/admin/pay-links", method: "POST" },
  assign_user: { endpoint: "/api/admin/tenants/assign", method: "POST" },
  approve_draft: { endpoint: "/api/admin/drafts", method: "POST" },
  reject_draft: { endpoint: "/api/admin/drafts", method: "POST" },
  update_tenant: { endpoint: "/api/admin/tenants", method: "PATCH" },
  run_scan: { endpoint: "/api/admin/scan", method: "POST" },
  revoke_pay_link: { endpoint: "/api/admin/pay-links", method: "DELETE" },
  send_invite: { endpoint: "/api/admin/invites", method: "POST" },
};

/**
 * Mission Control command bar. Chats with the read-only operator agent
 * (/api/admin/agent) over the __TOOL__/__RESULT__ text-stream protocol. The
 * agent never mutates; it returns confirmation proposals which render as cards
 * here. Clicking "Confirm" commits by POSTing the proposal params to the
 * existing /api/admin/* endpoints (which gate + audit).
 */
export function OperatorConsole() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalState, setProposalState] = useState<Record<string, { state: ProposalState; note?: string }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setBusy(true);
    setToolStatus(null);
    scrollToBottom();

    try {
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        throw new Error(res.status === 403 ? "Not authorized" : `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let result: { proposals?: Proposal[] } | null = null;

      // Push an empty assistant message we stream into.
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const flushAssistant = () => {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: assistantText };
          return next;
        });
        scrollToBottom();
      };

      const handleLine = (line: string) => {
        if (line.startsWith("__TOOL__")) {
          setToolStatus(line.slice(8));
          return;
        }
        if (line.startsWith("__RESULT__")) {
          try {
            result = JSON.parse(line.slice(10));
          } catch {
            result = null;
          }
          return;
        }
        assistantText += line + "\n";
        setToolStatus(null);
        flushAssistant();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) handleLine(line);
        if (buffer && !buffer.startsWith("__TOOL__") && !buffer.startsWith("__RESULT__")) {
          assistantText += buffer;
          buffer = "";
          setToolStatus(null);
          flushAssistant();
        }
      }
      if (buffer) {
        if (buffer.startsWith("__RESULT__")) {
          try {
            result = JSON.parse(buffer.slice(10));
          } catch {
            result = null;
          }
        } else if (!buffer.startsWith("__TOOL__")) {
          assistantText += buffer;
          flushAssistant();
        }
      }

      assistantText = assistantText.trimEnd();
      flushAssistant();
      if (result?.proposals?.length) setProposals(result.proposals);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setBusy(false);
      setToolStatus(null);
      scrollToBottom();
    }
  }

  async function commit(proposal: Proposal) {
    setProposalState((s) => ({ ...s, [proposal.id]: { state: "committing" } }));
    const { endpoint, method } = COMMIT_MAP[proposal.action];
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal.params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const note =
        proposal.action === "mint_pay_link" && data.payUrl
          ? `Live at ${data.payUrl}`
          : "Done";
      setProposalState((s) => ({ ...s, [proposal.id]: { state: "done", note } }));
    } catch (err) {
      setProposalState((s) => ({
        ...s,
        [proposal.id]: { state: "error", note: err instanceof Error ? err.message : "Failed" },
      }));
    }
  }

  return (
    <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
      <div className="px-5 py-4 border-b border-glass-border flex items-center gap-2">
        <span className="text-sm font-semibold text-warm-white">Mission Control</span>
        <span className="text-xs text-gray-muted">
          Ask about the portfolio, or propose a pay link / access grant
        </span>
      </div>

      <div ref={scrollRef} className="max-h-[360px] overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-gray-muted space-y-1">
            <p>Try:</p>
            <ul className="space-y-0.5 text-gray-faint">
              <li>&ldquo;What needs attention across the portfolio?&rdquo;</li>
              <li>&ldquo;What broke overnight?&rdquo;</li>
              <li>&ldquo;Mint a $1,500 build link for Acme Coffee&rdquo;</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={`msg-${i}`}
            className={
              m.role === "user"
                ? "text-sm text-warm-white"
                : "text-sm text-gray-muted whitespace-pre-wrap"
            }
          >
            <span className="text-xs uppercase tracking-wide text-gray-faint mr-2">
              {m.role === "user" ? "You" : "Agent"}
            </span>
            {m.content}
          </div>
        ))}
        {toolStatus && (
          <div role="status" aria-live="polite" className="text-xs text-accent animate-pulse">{toolStatus}</div>
        )}

        {proposals.map((p) => {
          const st = proposalState[p.id]?.state ?? "pending";
          return (
            <div
              key={p.id}
              className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm"
            >
              <p className="text-amber-100">{p.summary}</p>
              {st === "pending" && (
                <button
                  onClick={() => commit(p)}
                  className="mt-2 rounded-md bg-warm-white text-surface-base px-3 py-1 text-xs font-medium hover:opacity-90"
                >
                  Confirm
                </button>
              )}
              {st === "committing" && (
                <p className="mt-2 text-xs text-gray-muted">Committing…</p>
              )}
              {st === "done" && (
                <p className="mt-2 text-xs text-emerald-300">
                  ✓ {proposalState[p.id]?.note}
                </p>
              )}
              {st === "error" && (
                <p className="mt-2 text-xs text-red-300">{proposalState[p.id]?.note}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 py-3 border-t border-glass-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask Mission Control…"
          disabled={busy}
          className="flex-1 rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="rounded-md bg-warm-white text-surface-base px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
