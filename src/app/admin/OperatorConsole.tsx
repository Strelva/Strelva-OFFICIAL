"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A read-only structured answer card streamed from a whitelisted read tool. */
interface OperatorCard {
  tool: string;
  data: unknown;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  cards?: OperatorCard[];
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

/**
 * The agent replies in light markdown; the panel renders plain text. Strip the
 * few tokens it actually emits (bold/italic markers, bullet dashes, heading
 * hashes) so `**foo**` and `* item` don't show as literal syntax. Not a full
 * markdown parser — just the tokens that leak.
 */
function toPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "") // ### heading → heading
    .replace(/^\s*[*-]\s+/gm, "• ") // "* item" / "- item" → "• item"
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold** → bold
    .replace(/__(.+?)__/g, "$1") // __bold__ → bold
    .replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g, "$1"); // *italic* → italic
}

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

// ── Read-only answer cards ────────────────────────────────────────────────
// The operator agent's read tools return structured data; a table beats a prose
// wall for the high-value ones. These render that data and nothing else — no
// action, no mutation. A shape the renderer doesn't recognize returns null so
// the agent's own text (always present alongside) carries the answer instead.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Sage→amber→red tone for a letter grade.
 *
 * Kept local intentionally: the canonical TONE_PILL in status-colors.ts groups
 * A and B into a single "good" class using positive/10 opacity tokens, and has
 * no per-grade accent treatment for B. This version gives B its own accent/blue
 * pill and uses the positive0/warning0/critical0 shade tokens at /15 and /30
 * opacities — swapping to TONE_PILL would visually flatten A and B and change
 * the opacity values, which are meaningful at small pill scale.
 */
function gradeTone(grade: string): string {
  const g = grade.charAt(0).toUpperCase();
  if (g === "A") return "bg-positive0/15 text-positive border-positive0/30";
  if (g === "B") return "bg-accent/15 text-accent border-accent/30";
  if (g === "C") return "bg-warning0/15 text-warning border-warning0/30";
  return "bg-critical0/15 text-critical border-critical0/30";
}

function GradePill({ grade }: { grade: string }) {
  return (
    <span className={`inline-flex min-w-[1.75rem] justify-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${gradeTone(grade)}`}>
      {grade}
    </span>
  );
}

function TenantLink({ id, name }: { id: string; name?: string }) {
  return (
    <a href={`/admin/clients/${id}`} className="text-warm-white hover:text-accent hover:underline">
      {name || id}
    </a>
  );
}

function CardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border border-glass-border bg-gray-bg/60 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-faint">{title}</p>
      {children}
    </div>
  );
}

/** read_portfolio → per-tenant health rows + roll-up. */
function PortfolioCard({ data }: { data: Record<string, unknown> }) {
  const tenants = Array.isArray(data.tenants) ? data.tenants : null;
  if (!tenants) return null;
  const launch = isRecord(data.launch) ? data.launch : {};
  const mrr = typeof data.mrr === "number" ? data.mrr : null;
  return (
    <CardShell title="Portfolio health">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-muted">
        <span>{typeof data.tenantCount === "number" ? data.tenantCount : tenants.length} clients</span>
        {mrr !== null && <span>${mrr.toLocaleString()} MRR</span>}
        <span className="text-positive">{String(launch.ready ?? 0)} ready</span>
        <span className="text-warning">{String(launch.watch ?? 0)} watch</span>
        <span className="text-critical">{String(launch.blocked ?? 0)} blocked</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-faint">
            <tr>
              <th className="py-1 pr-3 font-medium">Client</th>
              <th className="py-1 pr-3 font-medium">Launch</th>
              <th className="py-1 pr-3 font-medium">Score</th>
              <th className="py-1 font-medium">Subscription</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, i) => {
              const row = isRecord(t) ? t : {};
              const id = String(row.id ?? "");
              const status = String(row.launchStatus ?? "—");
              const tone =
                status === "blocked" ? "text-critical" : status === "watch" ? "text-warning" : "text-positive";
              return (
                <tr key={id || i} className="border-t border-glass-border/50">
                  <td className="py-1 pr-3"><TenantLink id={id} name={row.siteName ? String(row.siteName) : undefined} /></td>
                  <td className={`py-1 pr-3 ${tone}`}>{status}</td>
                  <td className="py-1 pr-3 text-gray-muted">{typeof row.launchScore === "number" ? row.launchScore : "—"}</td>
                  <td className="py-1 text-gray-muted">{String(row.subscriptionStatus ?? "—")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

/** read_scan → ranked SEO / site-health table (worst first) or a single grade. */
function ScanCard({ data }: { data: Record<string, unknown> }) {
  const scanned = Array.isArray(data.scanned) ? data.scanned : null;
  if (scanned) {
    if (scanned.length === 0) return null;
    return (
      <CardShell title="Site health: ranked (worst first)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-faint">
              <tr>
                <th className="py-1 pr-3 font-medium">Client</th>
                <th className="py-1 pr-3 font-medium">Grade</th>
                <th className="py-1 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {scanned.map((s, i) => {
                const row = isRecord(s) ? s : {};
                const id = String(row.tenant ?? "");
                return (
                  <tr key={id || i} className="border-t border-glass-border/50">
                    <td className="py-1 pr-3"><TenantLink id={id} name={row.siteName ? String(row.siteName) : undefined} /></td>
                    <td className="py-1 pr-3"><GradePill grade={String(row.grade ?? "?")} /></td>
                    <td className="py-1 text-gray-muted">{typeof row.overallScore === "number" ? row.overallScore : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardShell>
    );
  }
  // Single-tenant scan.
  if (data.scanned === true && typeof data.tenantId === "string") {
    return (
      <CardShell title="Site health">
        <div className="flex items-center gap-2 text-xs">
          <TenantLink id={data.tenantId} />
          <GradePill grade={String(data.grade ?? "?")} />
          <span className="text-gray-muted">{typeof data.overallScore === "number" ? `${data.overallScore}/100` : ""}</span>
        </div>
      </CardShell>
    );
  }
  return null;
}

/** read_attention → severity-ranked needs-attention list. */
function AttentionCard({ data }: { data: Record<string, unknown> }) {
  const items = Array.isArray(data.items) ? data.items : null;
  if (!items || items.length === 0) return null;
  const dot: Record<string, string> = {
    high: "bg-critical",
    medium: "bg-warning",
    low: "bg-gray-faint",
  };
  return (
    <CardShell title="Needs attention">
      <ul className="space-y-1.5">
        {items.slice(0, 12).map((it, i) => {
          const row = isRecord(it) ? it : {};
          const severity = String(row.severity ?? "low");
          const tenant = typeof row.tenant === "string" ? row.tenant : null;
          return (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-muted">
              <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot[severity] ?? dot.low}`} />
              <span>
                {String(row.message ?? "")}
                {tenant && <> · <TenantLink id={tenant} /></>}
              </span>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

/** Dispatch a card to its renderer; unknown tool or bad shape renders nothing. */
function OperatorCardView({ card }: { card: OperatorCard }) {
  if (!isRecord(card.data)) return null;
  if (card.tool === "read_portfolio") return <PortfolioCard data={card.data} />;
  if (card.tool === "read_scan") return <ScanCard data={card.data} />;
  if (card.tool === "read_attention") return <AttentionCard data={card.data} />;
  return null;
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The command palette deep-links an ask into the console: cross-page via a
  // `?ask=…` query (read on mount), same-page via a live `strelva:ask` event.
  // Both just prefill + focus the input — display/navigation only, no send.
  useEffect(() => {
    function applyAsk(ask: string) {
      if (ask) setInput(ask);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("ask")) {
      applyAsk(params.get("ask") ?? "");
      params.delete("ask");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    function onAsk(e: Event) {
      applyAsk(typeof (e as CustomEvent).detail === "string" ? (e as CustomEvent).detail : "");
    }
    window.addEventListener("strelva:ask", onAsk);
    return () => window.removeEventListener("strelva:ask", onAsk);
  }, []);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  function pushCard(card: OperatorCard) {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = { ...next[i], cards: [...(next[i].cards ?? []), card] };
          break;
        }
      }
      return next;
    });
    scrollToBottom();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setProposals([]);
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
          // Preserve any cards pushCard attached — only the text is streaming in.
          next[next.length - 1] = { ...next[next.length - 1], role: "assistant", content: assistantText };
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
        if (line.startsWith("__CARD__")) {
          // Fail-soft: a malformed card is dropped; the agent's own text (always
          // streamed too) carries the answer, so the console never goes blank.
          try {
            const parsed = JSON.parse(line.slice(8));
            if (parsed && typeof parsed === "object" && typeof parsed.tool === "string") {
              pushCard(parsed as OperatorCard);
            }
          } catch {
            // ignore
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
        if (buffer && !buffer.startsWith("__TOOL__") && !buffer.startsWith("__RESULT__") && !buffer.startsWith("__CARD__")) {
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
        } else if (buffer.startsWith("__CARD__")) {
          try {
            const parsed = JSON.parse(buffer.slice(8));
            if (parsed && typeof parsed === "object" && typeof parsed.tool === "string") {
              pushCard(parsed as OperatorCard);
            }
          } catch {
            // ignore
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
    // No inner border/header — the enclosing "Mission Control" details panel
    // already labels and frames this (a second nested "Mission Control" header
    // read as two components glued together).
    <div ref={rootRef} id="mission-control">
      <div ref={scrollRef} className="max-h-[360px] overflow-y-auto space-y-3">
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
          <div key={`msg-${i}`} className="text-sm">
            <div
              className={
                m.role === "user"
                  ? "text-warm-white"
                  : "text-gray-muted whitespace-pre-wrap"
              }
            >
              <span className="text-xs uppercase tracking-wide text-gray-faint mr-2">
                {m.role === "user" ? "You" : "Agent"}
              </span>
              {m.role === "assistant" ? toPlainText(m.content) : m.content}
            </div>
            {m.role === "assistant" &&
              m.cards?.map((card, ci) => <OperatorCardView key={`card-${i}-${ci}`} card={card} />)}
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
              className="rounded-lg border border-warning0/25 bg-warning0/10 p-3 text-sm"
            >
              <p className="text-warning">{p.summary}</p>
              {st === "pending" && (
                <button
                  onClick={() => commit(p)}
                  className="mt-2 rounded-md bg-accent text-on-accent px-3 py-1 text-xs font-medium hover:opacity-90"
                >
                  Confirm
                </button>
              )}
              {st === "committing" && (
                <p className="mt-2 text-xs text-gray-muted">Committing…</p>
              )}
              {st === "done" && (
                <p className="mt-2 text-xs text-positive">
                  ✓ {proposalState[p.id]?.note}
                </p>
              )}
              {st === "error" && (
                <p className="mt-2 text-xs text-critical">{proposalState[p.id]?.note}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-glass-border flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Ask Mission Control"
          placeholder="Ask Mission Control…"
          disabled={busy}
          className="flex-1 rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
