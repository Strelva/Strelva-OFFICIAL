"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { SelectInput } from "@/components/ui/TextInput";
import { GooeyDisclosure } from "@/components/ui/motion/GooeyDisclosure";
import {
  XaButtonLink, XaComposer, XaComposerDock, XaHeadline, XaLabel, XaPebbleAvatar, XaPebbleScene, XaRow, XaRows, XaStatus, XaSystemTile, XaTextLink, XaWorking,
  type XaWorkingStep,
} from "@/components/ui/strelva/Xa";
import { ConversationStreamDecoder } from "@/experience/conversation/stream";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { askSuggestions } from "@/platform/ask/suggestions";
import { actorLabel } from "@/platform/presentation/actor";
import {
  askErrorMessage, askHistoryFailure, latestDraft, readAskResult, sameAppPath, readAskSuggestions, receiptLines, resultHeadline,
  type AskChangeOutcome, type AskConversationSummaryView, type AskMessageView, type AskReceiptItemView, type AskTurnResult,
} from "./ask-model";
import { AskChangePanel, AskChangeStory, AskQuestion, type AskDecider } from "./AskChange";
import styles from "./ask.module.css";

export interface AskStrelvaProps {
  workspaceId: string;
  businessName: string;
  /** The System this conversation is about (its page), or null on Home. */
  systemId?: string | null;
  systemName?: string;
  /** The System's kind, for its clay tile beside ideas. */
  systemKind?: string;
  /** The public address of the website this conversation changes, when known (harbordental.com). */
  address?: string;
  /** Who says yes to a drafted change. Defaults to the owner, unnamed. */
  decider?: AskDecider;
  /** Recorded outcomes of drafted changes, by the draft's item ref. The route does not supply these yet. */
  outcomes?: Readonly<Record<string, AskChangeOutcome>>;
  /** Which side of a waiting change opens first: the change, or what the decider sees. */
  initialChangeView?: "change" | "sees";
  /** Words to start with (from "Ask for a change"). Never sent until the person sends them. */
  initialText?: string;
  /** No new asks (shared read-only, stopped workspace). History stays readable. */
  readOnly?: boolean;
  readOnlyReason?: string;
  /** Embedded beside another surface (the site editor): no heading, no side panel. */
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
  /** Built-in Release label ("Ask Strelva Release 1") when STRELVA_APP_RELEASES is on. */
  release?: string;
}

type HistoryState = "loading" | "ready" | "unavailable" | "off";

const OWNER: AskDecider = { name: "the owner", you: false };

/**
 * Ask Strelva in the workspace (XA · AS1 to AS6). One person's conversation
 * with Strelva about this business (or one System), saved per business. Every
 * finished turn shows what it actually did: answered, drafted (not live),
 * opened a Possibility, or filed a Request. A drafted change sits beside the
 * conversation as the page its visitors would see. Nothing typed here
 * approves anything: the yes happens where the decider decides.
 */
export function AskStrelva({ workspaceId, businessName, systemId = null, systemName, systemKind, address, decider = OWNER, outcomes, initialChangeView = "change", initialText = "", readOnly = false, readOnlyReason, compact = false, canAskOnBehalf: initialCanAskOnBehalf = false, request: requestOverride, initialMessages = [], renderResult, refusalLinks, release }: AskStrelvaProps) {
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
  const [steps, setSteps] = useState<XaWorkingStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const historyId = useId();
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const place = systemName ?? businessName;
  const site = address ?? place;

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ workspaceId });
    if (systemId) params.set("systemId", systemId);
    try {
      const response = await request(`/api/workspace/ask?${params}`, { cache: "no-store" });
      if (response.status === 503) { setHistoryState(askHistoryFailure(response.status, await response.json().catch(() => null))); return; }
      if (!response.ok) { setHistoryState("unavailable"); return; }
      const body = await response.json() as { conversations?: AskConversationSummaryView[]; canAskOnBehalf?: boolean; suggestions?: unknown };
      setCanAskOnBehalf(body.canAskOnBehalf === true);
      setConversations(Array.isArray(body.conversations) ? body.conversations : []);
      setSuggestions(readAskSuggestions(body.suggestions));
      setHistoryState("ready");
    } catch {
      setHistoryState("unavailable");
    }
  }, [request, systemId, workspaceId]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { if (initialText) inputRef.current?.focus(); }, [initialText]);
  useEffect(() => { logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight }); }, [messages]);

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
      setHistoryOpen(false);
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
    setShowThread(false);
    inputRef.current?.focus();
  }

  async function send(event?: FormEvent, words?: string) {
    event?.preventDefault();
    const text = (words ?? input).trim();
    if (!text || streaming || readOnly || !conversationMine) return;
    const userMessage: AskMessageView = { id: `local-${Date.now()}`, role: "user", content: text, result: null, askedOnBehalf: canAskOnBehalf && askedOnBehalf ? askedOnBehalf : null };
    const replyId = `reply-${Date.now()}`;
    const prior = messages.filter((message) => message.content.trim()).slice(-38).map((message) => ({ role: message.role, content: message.content.slice(0, 20_000) }));
    setMessages((current) => [...current, userMessage, { id: replyId, role: "assistant", content: "", result: null, pending: true }]);
    if (words === undefined) setInput("");
    setError(null);
    setStreaming(true);
    setSteps([]);
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
          // Each tool the route reports becomes one named step; the trail shows real progress only.
          else if (item.type === "tool") setSteps((current) => [...current.map((step) => step.state === "active" ? { ...step, state: "done" as const } : step), { id: `${current.length}`, label: item.label, state: "active" }]);
          else if (item.type === "tool-done") setSteps((current) => current.map((step) => step.state === "active" ? { ...step, state: "done" as const } : step));
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
      setSteps([]);
    }
  }

  const examples = suggestions ?? askSuggestions({ businessName, systemName: address ?? systemName, aboutSystem: Boolean(systemId) });
  const blockedReason = readOnly ? readOnlyReason || "You can read this business's conversations but can't ask here." : !conversationMine ? "This conversation was started by someone else. Start a new one to ask." : null;
  const unsaved = messages.some((message) => message.result && !message.result.saved);
  const empty = messages.length === 0;
  const last = messages.at(-1);
  const openQuestion = !streaming && !blockedReason && last?.role === "assistant" && last.result?.question ? last.result.question : null;
  const draft = compact ? null : latestDraft(messages);
  const outcome = draft ? outcomeFor(draft.item, outcomes) : null;
  const making = !compact && last?.role === "assistant" && !last.pending && (Boolean(last.result?.creationAction) || Boolean(last.result?.items.some(item => item.kind === "possibility" && item.status === "opened")));
  const makingName = making && last?.result ? (last.result.items.find(item => item.kind === "possibility")?.summary.split(" · ")[0] || null) : null;
  const scope = { label: systemName && systemName !== businessName ? `${businessName} · ${systemName}` : businessName };
  const placeholder = blockedReason ?? (empty && !compact ? "Tell Strelva what should happen" : openQuestion ? "Or type the answer" : draft && !outcome ? "Ask for a change before it goes live" : `Ask Strelva about ${address ?? place}`);
  const deciderYes = decider.you ? "your yes" : `${decider.name}'s yes`;

  const composer = <XaComposer value={input} onChange={setInput} onSubmit={() => void send()} placeholder={placeholder} inputLabel={`Ask Strelva about ${place}`} scope={scope}
    disabled={Boolean(blockedReason)} busy={streaming} maxLength={20_000} inputRef={inputRef} />;

  const footer = <div className={styles.footer}>
    {canAskOnBehalf ? <SelectInput label="Who asked for this?" value={askedOnBehalf} disabled={streaming || Boolean(blockedReason)}
      options={[{ value: "", label: "I am asking" }, { value: "email", label: "The owner, by email" }, { value: "phone", label: "The owner, by phone" }]}
      onChange={event => setAskedOnBehalf(event.target.value as "email" | "phone" | "")}
      helperText="The owner still decides in Needs you." /> : null}
    <p className={styles.note}>
      Saying yes in this conversation never approves anything.
      {release ? <span> · {release}</span> : null}
    </p>
    <div className={styles.history}>
      <span className={styles.historyLinks}>
        <button type="button" className={styles.quietLink} aria-expanded={historyOpen} aria-controls={historyId} onClick={() => setHistoryOpen(open => !open)}>Earlier conversations</button>
        {!empty ? <button type="button" className={styles.quietLink} onClick={startNew} disabled={streaming}>New conversation</button> : null}
      </span>
      <GooeyDisclosure id={historyId} open={historyOpen}>
        {historyState === "loading" ? <p role="status" className={styles.historyState}>Loading conversations</p>
          : historyState === "unavailable" ? <p className={styles.historyState}>Earlier conversations can&apos;t be read right now, and new ones may not be saved. <XaTextLink onClick={() => void loadConversations()}>Try again</XaTextLink></p>
          : historyState === "off" ? <p className={styles.historyState}>Ask Strelva isn&apos;t on for this business yet.</p>
          : conversations.length === 0 ? <p className={styles.historyState}>Nothing yet. Conversations you start here are kept for this business.</p>
          : <ul className={styles.historyList} aria-label="Earlier conversations">{conversations.map(item => <li key={item.id} aria-current={item.id === conversationId || undefined}>
            <button type="button" disabled={streaming || opening === item.id} onClick={() => void openConversation(item.id)}>{item.title}</button>
            <span>{item.mine ? null : "Someone else's · "}<time dateTime={item.updatedAt} suppressHydrationWarning>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></span>
          </li>)}</ul>}
      </GooeyDisclosure>
    </div>
  </div>;

  const errorLine = error ? <div className={styles.error} role="alert"><XaPebbleAvatar size={28} /><p>{error}</p></div> : null;

  if (empty && !compact) return <section className={styles.ask} data-layout="empty" aria-labelledby={titleId}>
    <div className={styles.intro}>
      <XaPebbleAvatar size={56} />
      <div className={styles.introHead}>
        <XaHeadline id={titleId}>What should change for {businessName}?</XaHeadline>
        <p className={styles.introLede}>Say it the way you&apos;d tell a person. Nothing goes public without {deciderYes}.</p>
      </div>
      {composer}
      {errorLine}
      <div className={styles.ideas}>
        <XaLabel id={`${titleId}-ideas`}>Start from what {businessName} needs</XaLabel>
        <XaRows label={`Things to ask about ${businessName}`}>
          {examples.map(example => <XaRow key={example} lead={<XaSystemTile kind={systemKind ?? "website"} size={30} />} title={example}
            onClick={blockedReason ? undefined : () => { setInput(example); inputRef.current?.focus(); }} />)}
        </XaRows>
      </div>
      {footer}
    </div>
  </section>;

  const story = outcome && draft ? <AskChangeStory outcome={outcome} site={site} decider={decider} /> : null;
  const thread = <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-relevant="additions" aria-busy={streaming || undefined} aria-label={`Conversation about ${place}`}>
    {messages.map(message => <Message key={message.id} message={message} place={place} steps={message.pending && message === last ? steps : []}>
      {renderResult?.(message) ?? (message.result ? <TurnResult result={message.result} latest={message === last} decider={decider} workspaceId={workspaceId} refusalLinks={refusalLinks}
        inlineReview={compact || draft?.message !== message} question={message === last && openQuestion ? <AskQuestion question={openQuestion} onAnswer={words => void send(undefined, words)} onAdd={() => inputRef.current?.focus()} /> : null} /> : null)}
    </Message>)}
  </div>;

  const panel = draft ? <AskChangePanel item={draft.item} site={site} decider={decider} outcome={outcome} initialView={initialChangeView} />
    : making ? <figure className={styles.making} aria-label="Pebble adding a new System to the business">
      <XaPebbleScene pose="adds" size={280} bare />
      <figcaption>{makingName ? `Pebble is adding ${makingName}. ` : "Pebble is adding it. "}Nothing turns on until {decider.you ? "you say yes" : `${decider.name} says yes`}.</figcaption>
    </figure> : null;

  return <section className={styles.ask} data-layout={compact ? "compact" : panel ? "split" : "thread"} aria-labelledby={titleId}>
    <h1 id={titleId} className={styles.srOnly}>Ask Strelva about {place}</h1>
    <div className={styles.grid}>
      <div className={styles.thread}>
        {story}
        {story && !showThread ? <p className={styles.note}><button type="button" className={styles.quietLink} onClick={() => setShowThread(true)}>Show the conversation</button></p> : null}
        {story && !showThread ? null : thread}
        {errorLine}
        {unsaved ? <p className={styles.note}>Part of this conversation couldn&apos;t be saved. What Strelva drafted or filed is unaffected.</p> : null}
      </div>
      {panel ? <aside className={styles.panel} aria-label="The change this conversation made">{panel}</aside> : null}
      <div className={styles.threadFooter}>
        {footer}
        {compact ? composer : null}
      </div>
    </div>
    {compact ? null : <XaComposerDock><div className={styles.dockGrid} data-layout={panel ? "split" : "thread"}><div className={styles.dockThread}>{composer}</div></div></XaComposerDock>}
  </section>;
}

function outcomeFor(item: AskReceiptItemView, outcomes: AskStrelvaProps["outcomes"]): AskChangeOutcome | null {
  if (!outcomes) return null;
  for (const ref of [item.needsYou?.itemRef, ...item.ids]) if (ref && outcomes[ref]) return outcomes[ref]!;
  return null;
}

function Message({ message, place, steps, children }: { message: AskMessageView; place: string; steps: readonly XaWorkingStep[]; children?: ReactNode }) {
  if (message.role === "user") return <article className={styles.you}>
    <h2 className={styles.srOnly}>You asked</h2>
    {message.askedOnBehalf ? <small>Asked for the owner by {message.askedOnBehalf}</small> : null}
    <p>{message.content}</p>
  </article>;
  const working = message.pending ? <XaWorking title={[...steps].reverse().find(step => step.state === "active")?.label ?? `Reading ${place}`} steps={steps} /> : null;
  return <article className={styles.says}>
    <h2 className={styles.srOnly}>Strelva</h2>
    <XaPebbleAvatar size={28} />
    <div className={styles.saysBody}>
      {message.content ? <p className={styles.text}>{message.content}</p> : null}
      {working}
      {children}
    </div>
  </article>;
}

function TurnResult({ result, latest, decider, workspaceId, refusalLinks, question, inlineReview }: { result: AskTurnResult; latest: boolean; decider: AskDecider; workspaceId: string; refusalLinks?: { needsYou: string; help: string }; question: ReactNode; inlineReview: boolean }) {
  const refusal = result.kind === "refusal" || Boolean(result.budgetRecovery);
  const headline = result.items.length ? null : resultHeadline(result);
  // The newest opened Possibility offers Try as the screen's one primary; its sentence keeps the rest.
  const tryItem = latest && !result.creationAction ? result.items.find(item => item.kind === "possibility" && item.status === "opened" && (sameAppPath(item.tryHref) ?? sameAppPath(item.previewHref))) : undefined;
  const tryHref = tryItem ? sameAppPath(tryItem.tryHref) ?? sameAppPath(tryItem.previewHref) : undefined;
  return <>
    {question}
    {result.items.map((item, index) => <ItemLine key={`${index}:${item.toolId}`} item={item} result={result} decider={decider} promoted={item === tryItem} inlineReview={inlineReview} />)}
    {tryItem && tryHref ? <div className={styles.actions}><XaButtonLink variant="primary" href={tryHref}>{tryItem.tryHref ? "Try it" : "Open preview"}</XaButtonLink></div> : null}
    {headline && !result.creationAction && !result.question ? <p className={styles.meta}>{headline}</p> : null}
    {result.creationAction ? <div className={styles.actions}><XaButtonLink variant={latest ? "primary" : "secondary"} href={result.creationAction.href}>{result.creationAction.label}</XaButtonLink></div> : null}
    {refusal ? <p className={styles.links}>
      {result.items.some(item => item.summary === "approval_in_chat") ? <><XaTextLink href={refusalLinks?.needsYou ?? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=needs-you`}>Open Needs you</XaTextLink><span aria-hidden="true"> · </span></> : null}
      <XaTextLink href={result.budgetRecovery === "plan" ? `/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}` : refusalLinks?.help ?? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=help`}>{result.budgetRecovery === "plan" ? "Choose a plan" : result.items.some(item => item.summary === "budget_paused") ? "Bring in an agency" : "Ask for help"}</XaTextLink>
    </p> : null}
  </>;
}

/** One receipt item as one line: a dot and a word only when something waits or failed. */
function ItemLine({ item, result, decider, promoted = false, inlineReview = true }: { item: AskReceiptItemView; result: AskTurnResult; decider: AskDecider; promoted?: boolean; inlineReview?: boolean }) {
  const line = receiptLines({ ...result, items: [item] })[0];
  if (!line) return null;
  if (line.tone === "failed") return <p className={styles.line}><XaStatus kind="down" size="sm">Didn&apos;t finish</XaStatus><span>{line.text}</span></p>;
  if (item.kind === "draft" && item.needsYou?.route === "owner_decides") return <p className={styles.line}>
    <XaStatus kind="waits" size="sm">{decider.you ? "Waits for your yes" : `Waiting for ${decider.name}`}</XaStatus>
    <span className={styles.faint}>· nothing is public yet</span>
    {decider.you && inlineReview && line.decideHref ? <span className={styles.lineLink}><XaTextLink href={line.decideHref}>Review it</XaTextLink></span> : null}
    <span className={styles.srOnly}>{line.text}</span>
  </p>;
  const by = item.actor ? actorLabel(item.actor) : null;
  const openHref = promoted ? undefined : line.openHref;
  return <p className={styles.line} data-tone={line.tone}>
    <span>{line.text}{by && item.kind !== "request" ? ` By ${by}.` : ""}</span>
    {openHref || line.decideHref ? <span className={styles.lineLink}>
      {openHref ? <XaTextLink href={openHref}>{line.openLabel}</XaTextLink> : null}
      {openHref && line.decideHref ? <span aria-hidden="true"> · </span> : null}
      {line.decideHref ? <XaTextLink href={line.decideHref}>Open Needs you</XaTextLink> : null}
    </span> : null}
  </p>;
}
