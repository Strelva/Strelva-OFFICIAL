"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, CircleAlert, History, Loader2, Plus } from "lucide-react";
import { SelectInput } from "@/components/ui/TextInput";
import { ConversationStreamDecoder } from "@/experience/conversation/stream";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import {
  ASK_EXAMPLES, askErrorMessage, askHistoryFailure, readAskResult, receiptLines, resultHeadline,
  type AskConversationSummaryView, type AskMessageView, type AskTurnResult,
} from "./ask-model";
import styles from "./ask.module.css";

export interface AskStrelvaProps {
  workspaceId: string;
  businessName: string;
  /** The System this conversation is about (its page), or null on Home. */
  systemId?: string | null;
  systemName?: string;
  /** Words to start with (from "Ask for a change"). Never sent until the person sends them. */
  initialText?: string;
  /** No new asks (shared read-only, stopped workspace). History stays readable. */
  readOnly?: boolean;
  readOnlyReason?: string;
  /** Embedded beside another surface (the site editor): no page heading. */
  compact?: boolean;
  /** Fixture initial value; the server confirms operator authority before enabling this. */
  canAskOnBehalf?: boolean;
  /** Lets a caller supply transport (the local preview). Defaults to the workspace request. */
  request?: typeof fetch;
}

type HistoryState = "loading" | "ready" | "unavailable" | "off";

/**
 * Ask Strelva in the workspace. One person's conversation with Strelva about
 * this business (or one System), saved per business. Every finished turn
 * shows what it actually did: answered, drafted (not live), opened a
 * Possibility, or filed a Request. Nothing typed here approves anything.
 */
export function AskStrelva({ workspaceId, businessName, systemId = null, systemName, initialText = "", readOnly = false, readOnlyReason, compact = false, canAskOnBehalf: initialCanAskOnBehalf = false, request: requestOverride }: AskStrelvaProps) {
  const contextRequest = useWorkspaceRequest();
  const request = requestOverride ?? contextRequest;
  const [canAskOnBehalf, setCanAskOnBehalf] = useState(initialCanAskOnBehalf);
  const [askedOnBehalf, setAskedOnBehalf] = useState<"email" | "phone" | "">("");
  const [conversations, setConversations] = useState<AskConversationSummaryView[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationSystemId, setConversationSystemId] = useState<string | null>(systemId);
  const [conversationMine, setConversationMine] = useState(true);
  const [messages, setMessages] = useState<AskMessageView[]>([]);
  const [input, setInput] = useState(initialText);
  const [streaming, setStreaming] = useState(false);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const place = systemName ?? businessName;

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ workspaceId });
    if (systemId) params.set("systemId", systemId);
    try {
      const response = await request(`/api/workspace/ask?${params}`, { cache: "no-store" });
      if (response.status === 503) { setHistoryState(askHistoryFailure(response.status, await response.json().catch(() => null))); return; }
      if (!response.ok) { setHistoryState("unavailable"); return; }
      const body = await response.json() as { conversations?: AskConversationSummaryView[]; canAskOnBehalf?: boolean };
      setCanAskOnBehalf(body.canAskOnBehalf === true);
      setConversations(Array.isArray(body.conversations) ? body.conversations : []);
      setHistoryState("ready");
    } catch {
      setHistoryState("unavailable");
    }
  }, [request, systemId, workspaceId]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { if (initialText) inputRef.current?.focus(); }, [initialText]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages]);

  async function openConversation(id: string) {
    if (streaming) return;
    setOpening(id);
    setError(null);
    try {
      const params = new URLSearchParams({ workspaceId, conversationId: id });
      const response = await request(`/api/workspace/ask?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { conversation?: { id: string; systemId: string | null; mine: boolean; messages: Array<{ id: string; role: "user" | "assistant"; content: string; result: unknown; askedOnBehalf: "email" | "phone" | null }> }; error?: string } | null;
      if (!response.ok || !body?.conversation) { setError(askErrorMessage(response.status, body?.error ?? null)); return; }
      setConversationId(body.conversation.id);
      setConversationSystemId(body.conversation.systemId);
      setConversationMine(body.conversation.mine);
      setMessages(body.conversation.messages.map((message) => ({ id: message.id, role: message.role, content: message.content, result: readAskResult(message.result), askedOnBehalf: message.askedOnBehalf })));
    } catch {
      setError("This conversation couldn't be opened. Try again.");
    } finally {
      setOpening(null);
    }
  }

  function startNew() {
    if (streaming) return;
    setConversationId(null);
    setConversationSystemId(systemId);
    setConversationMine(true);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || streaming || readOnly || !conversationMine) return;
    const userMessage: AskMessageView = { id: `local-${Date.now()}`, role: "user", content: text, result: null, askedOnBehalf: canAskOnBehalf && askedOnBehalf ? askedOnBehalf : null };
    const replyId = `reply-${Date.now()}`;
    const prior = messages.filter((message) => message.content.trim()).slice(-38).map((message) => ({ role: message.role, content: message.content.slice(0, 20_000) }));
    setMessages((current) => [...current, userMessage, { id: replyId, role: "assistant", content: "", result: null, pending: true }]);
    setInput("");
    setError(null);
    setStreaming(true);
    setToolLabel(null);
    const turn: { result: AskTurnResult | null } = { result: null };
    try {
      const response = await request("/api/workspace/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          ...(conversationSystemId ? { systemId: conversationSystemId } : {}),
          ...(conversationId ? { conversationId } : {}),
          ...(canAskOnBehalf && askedOnBehalf ? { askedOnBehalf } : {}),
          messages: [...prior, { role: "user", content: text }],
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw Object.assign(new Error(askErrorMessage(response.status, body?.error ?? null)), { status: response.status });
      }
      const decoder = new ConversationStreamDecoder<unknown>();
      const reader = response.body.getReader();
      const apply = (events: ReturnType<typeof decoder.push>) => {
        for (const item of events) {
          if (item.type === "text") setMessages((current) => current.map((message) => message.id === replyId ? { ...message, content: message.content + item.text } : message));
          else if (item.type === "tool") setToolLabel(item.label);
          else if (item.type === "tool-done") setToolLabel(null);
          else if (item.type === "result") turn.result = readAskResult(item.result);
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        apply(decoder.push(value));
      }
      apply(decoder.finish());
      const result = turn.result;
      setMessages((current) => current.map((message) => message.id === replyId ? { ...message, content: message.content.trim() || "Strelva can't answer right now. Nothing was changed.", result, pending: false } : message));
      if (result?.conversationId) {
        setConversationId(result.conversationId);
        void loadConversations();
      }
    } catch (cause) {
      // The person's words go back in the box; nothing was sent or changed.
      setMessages((current) => current.filter((message) => message.id !== replyId && message.id !== userMessage.id));
      setInput(text);
      setError(cause instanceof Error && cause.message ? cause.message : "Strelva can't answer right now. Nothing was changed.");
    } finally {
      setStreaming(false);
      setToolLabel(null);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const examples = systemId ? ASK_EXAMPLES.system : ASK_EXAMPLES.home;
  const blockedReason = readOnly ? readOnlyReason || "You can read this business's conversations but can't ask here." : !conversationMine ? "This conversation was started by someone else. Start a new one to ask." : null;
  const unsaved = messages.some((message) => message.result && !message.result.saved);

  return <section className={styles.ask} data-compact={compact || undefined} aria-labelledby="ask-strelva-title">
    <header className={styles.head}>
      <div>
        <h1 id="ask-strelva-title" className={compact ? styles.compactTitle : "font-display"}>Ask Strelva</h1>
        <p>{systemName ? `About ${systemName}.` : `About ${businessName}.`} Strelva answers, drafts a change, opens a Possibility or files a Request. Decisions stay in Needs you.</p>
      </div>
      <button type="button" className={styles.newButton} onClick={startNew} disabled={streaming || (!conversationId && messages.length === 0)}><Plus size={16} aria-hidden="true" />New conversation</button>
    </header>

    <div className={styles.body}>
      <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-relevant="additions" aria-busy={streaming || undefined} aria-label={`Conversation about ${place}`}>
        {messages.length === 0 ? <div className={styles.empty}>
          <p>Ask in your own words. For example:</p>
          <ul>{examples.map((example) => <li key={example}><button type="button" disabled={Boolean(blockedReason)} onClick={() => { setInput(example); inputRef.current?.focus(); }}>{example}</button></li>)}</ul>
        </div> : messages.map((message) => <article key={message.id} className={styles.message} data-role={message.role}>
          <h2 className="sr-only">{message.role === "user" ? "You asked" : "Strelva"}</h2>
          {message.role === "user" && message.askedOnBehalf ? <small>Asked for the owner by {message.askedOnBehalf}</small> : null}
          {message.pending && !message.content ? <p className={styles.thinking}><Loader2 size={14} className="animate-spin" aria-hidden="true" />{toolLabel || "Strelva is reading…"}</p> : <p className={styles.text}>{message.content}</p>}
          {message.pending && message.content && toolLabel ? <p className={styles.thinking}><Loader2 size={14} className="animate-spin" aria-hidden="true" />{toolLabel}</p> : null}
          {message.result ? <TurnReceipt result={message.result} /> : null}
        </article>)}
      </div>

      <aside className={styles.history} aria-label="Earlier conversations">
        <h2><History size={15} aria-hidden="true" />Earlier</h2>
        {historyState === "loading" ? <p role="status">Loading conversations…</p>
          : historyState === "unavailable" ? <p role="status">Earlier conversations can&apos;t be read right now. New ones may not be saved.</p>
          : historyState === "off" ? <p role="status">Ask Strelva isn&apos;t on for this business yet.</p>
          : conversations.length === 0 ? <p>Nothing yet. Conversations you start here are kept for this business.</p>
          : <ul>{conversations.map((item) => <li key={item.id}><button type="button" aria-current={item.id === conversationId || undefined} disabled={streaming || opening === item.id} onClick={() => void openConversation(item.id)}>
            <span>{item.title}</span>
            <small>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{item.mine ? "" : " · someone else's"}</small>
          </button></li>)}</ul>}
      </aside>
    </div>

    {error ? <p role="alert" className={styles.error}><CircleAlert size={16} aria-hidden="true" />{error}</p> : null}
    {unsaved ? <p role="status" className={styles.note}>Part of this conversation couldn&apos;t be saved. What Strelva drafted or filed is unaffected.</p> : null}

    {canAskOnBehalf ? <SelectInput label="Who asked for this?" value={askedOnBehalf} disabled={streaming || Boolean(blockedReason)}
      options={[{ value: "", label: "I am asking" }, { value: "email", label: "The owner, by email" }, { value: "phone", label: "The owner, by phone" }]}
      onChange={(event) => setAskedOnBehalf(event.target.value as "email" | "phone" | "")}
      helperText="The owner still decides in Needs you." /> : null}
    <form className={styles.composer} onSubmit={(event) => void send(event)}>
      <label htmlFor="ask-strelva-input" className="sr-only">Ask Strelva about {place}</label>
      <textarea id="ask-strelva-input" ref={inputRef} value={input} rows={2} maxLength={20_000} disabled={Boolean(blockedReason)} placeholder={blockedReason ?? `Ask about ${place}`} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} />
      <div className={styles.composerFoot}>
        <small>{blockedReason ?? "Saying yes here never approves anything. Approvals happen in Needs you."}</small>
        <button type="submit" aria-label="Send" disabled={streaming || !input.trim() || Boolean(blockedReason)}>{streaming ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}</button>
      </div>
    </form>
  </section>;
}

function TurnReceipt({ result }: { result: AskTurnResult }) {
  const lines = receiptLines(result);
  const headline = lines.length ? null : resultHeadline(result);
  if (!lines.length && !headline) return null;
  return <div className={styles.receipt} aria-label="What Strelva did">
    {headline ? <p>{headline}</p> : <ul>{lines.map((line) => <li key={line.key} data-tone={line.tone}>
      <span>{line.text}</span>
      {line.decideHref ? <a href={line.decideHref}>Open Needs you</a> : null}
      {line.ref ? <small>Ref {line.ref}</small> : null}
    </li>)}</ul>}
  </div>;
}
