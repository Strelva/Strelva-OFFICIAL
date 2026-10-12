"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { StComposerBar, StComposerDock, StEmpty, StHead, StMono, StNotice, StRows, StRow, StSection, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { SelectInput } from "@/components/ui/TextInput";
import { GooeyDisclosure } from "@/components/ui/motion/GooeyDisclosure";
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
  /** Optional saved snapshot; callers still own the source and authority. Preview fixtures use this. */
  initialMessages?: readonly AskMessageView[];
  /** Render a supplied result object. This is presentation only; it never grants write authority. */
  renderResult?: (message: AskMessageView) => ReactNode;
  /** Local previews keep recovery navigation inside their fictional business. */
  refusalLinks?: { needsYou: string; help: string };

}

type HistoryState = "loading" | "ready" | "unavailable" | "off";

/**
 * Ask Strelva in the workspace. One person's conversation with Strelva about
 * this business (or one System), saved per business. Every finished turn
 * shows what it actually did: answered, drafted (not live), opened a
 * Possibility, or filed a Request. Nothing typed here approves anything.
 */
export function AskStrelva({ workspaceId, businessName, systemId = null, systemName, initialText = "", readOnly = false, readOnlyReason, compact = false, canAskOnBehalf: initialCanAskOnBehalf = false, request: requestOverride, initialMessages = [], renderResult, refusalLinks }: AskStrelvaProps) {
  const contextRequest = useWorkspaceRequest();
  const request = requestOverride ?? contextRequest;
  const [canAskOnBehalf, setCanAskOnBehalf] = useState(initialCanAskOnBehalf);
  const [askedOnBehalf, setAskedOnBehalf] = useState<"email" | "phone" | "">("");
  const [conversations, setConversations] = useState<AskConversationSummaryView[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationSystemId, setConversationSystemId] = useState<string | null>(systemId);
  const [conversationMine, setConversationMine] = useState(true);
  const [messages, setMessages] = useState<AskMessageView[]>(() => [...initialMessages]);
  const [input, setInput] = useState(initialText);
  const [streaming, setStreaming] = useState(false);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyId = useId();
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


  const examples = systemId ? ASK_EXAMPLES.system : ASK_EXAMPLES.home;
  const blockedReason = readOnly ? readOnlyReason || "You can read this business's conversations but can't ask here." : !conversationMine ? "This conversation was started by someone else. Start a new one to ask." : null;
  const unsaved = messages.some((message) => message.result && !message.result.saved);

  const composer = <StComposerBar scope={place} placeholder={blockedReason ?? `Ask about ${place}`} value={input} onChange={setInput} onSubmit={() => void send()} disabled={streaming || Boolean(blockedReason)} inputLabel={`Ask Strelva about ${place}`} multiline textareaRef={inputRef} maxLength={20_000} />;

  return <section className={styles.ask} data-compact={compact || undefined} aria-labelledby="ask-strelva-title">
    <StHead title="Ask Strelva" titleId="ask-strelva-title" meta={<>{systemName ? `About ${systemName}.` : `About ${businessName}.`} Strelva answers, drafts a change, opens a Possibility or files a Request. Decisions stay in Needs you.</>} actions={<StTextButton onClick={startNew} disabled={streaming || (!conversationId && messages.length === 0)}>New conversation</StTextButton>} />

    <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-relevant="additions" aria-busy={streaming || undefined} aria-label={`Conversation about ${place}`}>
      {messages.length === 0 ? <StSection title="Ask in your own words" meta="For example">
        <StRows>{examples.map(example => <StRow key={example} title={<StTextButton disabled={Boolean(blockedReason)} onClick={() => { setInput(example); inputRef.current?.focus(); }}>{example}</StTextButton>} />)}</StRows>
      </StSection> : messages.map(message => <article key={message.id} className={styles.message} data-role={message.role}>
        <h2 className="sr-only">{message.role === "user" ? "You asked" : "Strelva"}</h2>
        {message.role === "assistant" ? <LogoMark className={styles.mark} /> : null}
        <div className={styles.messageBody}>
          {message.role === "user" && message.askedOnBehalf ? <small>Asked for the owner by {message.askedOnBehalf}</small> : null}
          {message.pending && !message.content ? <StSurface label="Strelva is working"><p className={styles.thinking}><Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />{toolLabel || "Strelva is reading…"}</p></StSurface> : <p className={styles.text}>{message.content}</p>}
          {message.pending && message.content && toolLabel ? <p className={styles.thinking}><Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />{toolLabel}</p> : null}
          {renderResult?.(message) ?? (message.result ? <TurnReceipt result={message.result} /> : null)}
          {message.result?.kind === "refusal" ? <div className={styles.refusalActions}>{message.result.items.some(item => item.summary === "approval_in_chat") ? <StTextButton href={refusalLinks?.needsYou ?? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=needs-you`}>Open Needs you</StTextButton> : null}<StTextButton href={refusalLinks?.help ?? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=help`}>Ask for help</StTextButton></div> : null}
        </div>
      </article>)}
    </div>

    {error ? <StNotice tone="critical" icon={<CircleAlert size={16} aria-hidden="true" />}>{error}</StNotice> : null}
    {unsaved ? <StNotice>Part of this conversation couldn&apos;t be saved. What Strelva drafted or filed is unaffected.</StNotice> : null}

    {canAskOnBehalf ? <SelectInput label="Who asked for this?" value={askedOnBehalf} disabled={streaming || Boolean(blockedReason)}
      options={[{ value: "", label: "I am asking" }, { value: "email", label: "The owner, by email" }, { value: "phone", label: "The owner, by phone" }]}
      onChange={event => setAskedOnBehalf(event.target.value as "email" | "phone" | "")}
      helperText="The owner still decides in Needs you." /> : null}
    <div className={styles.history}>
      <StTextButton aria-expanded={historyOpen} aria-controls={historyId} onClick={() => setHistoryOpen(open => !open)}>Earlier conversations</StTextButton>
      <GooeyDisclosure id={historyId} open={historyOpen}>
      {historyState === "loading" ? <><p role="status">Loading conversations…</p><StSkeleton label="Loading conversations" /></>
        : historyState === "unavailable" ? <StNotice>Earlier conversations can&apos;t be read right now. New ones may not be saved. <StTextButton onClick={() => void loadConversations()}>Try again</StTextButton></StNotice>
        : historyState === "off" ? <StNotice>Ask Strelva isn&apos;t on for this business yet.</StNotice>
        : conversations.length === 0 ? <StEmpty>Nothing yet. Conversations you start here are kept for this business.</StEmpty>
        : <StRows>{conversations.map(item => <StRow key={item.id} selected={item.id === conversationId} title={<StTextButton disabled={streaming || opening === item.id} onClick={() => void openConversation(item.id)}>{item.title}</StTextButton>} detail={item.mine ? undefined : "Someone else's conversation"} end={<StMono>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</StMono>} />)}</StRows>}
      </GooeyDisclosure>
    </div>
    <p className={styles.note}>{blockedReason ?? "Saying yes here never approves anything. Approvals happen in Needs you."}</p>
    {compact ? composer : <StComposerDock>{composer}</StComposerDock>}
  </section>;
}

function TurnReceipt({ result }: { result: AskTurnResult }) {
  const lines = receiptLines(result);
  const headline = lines.length ? null : resultHeadline(result);
  if (!lines.length && !headline) return null;
  return <StSurface label="What Strelva did">
    {headline ? <p className={styles.receiptHeadline}>{headline}</p> : <StRows>{lines.map(line => <StRow key={line.key}
      title={<StState kind={line.tone === "failed" ? "down" : line.tone === "waiting" ? "need" : "live"}>{line.text}</StState>}
      detail={line.ref ? <StMono>Ref {line.ref}</StMono> : undefined}
      end={line.decideHref ? <StTextButton tone="accent" href={line.decideHref}>Open Needs you</StTextButton> : undefined}
    />)}</StRows>}
  </StSurface>;
}
