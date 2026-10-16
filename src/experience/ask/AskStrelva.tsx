"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { SelectInput } from "@/components/ui/TextInput";
import { GooeyDisclosure } from "@/components/ui/motion/GooeyDisclosure";
import {
  XaButtonLink, XaComposer, XaComposerDock, XaHeadline, XaLabel, XaMark, XaPebbleAvatar, XaRow, XaRows, XaStatus, XaSystemTile, XaTextLink, XaWorking,
  type XaComposerScope, type XaWorkingStep,
} from "@/components/ui/strelva/Xa";
import { ConversationStreamDecoder } from "@/experience/conversation/stream";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { askIdeas } from "@/platform/ask/suggestions";
import { actorLabel } from "@/platform/presentation/actor";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import {
  askErrorMessage, askHistoryFailure, latestDraft, readAskIdeas, readAskOutcomes, readAskOwner, readAskResult, readAskSuggestions, receiptLines, resultHeadline,
  type AskChangeOutcome, type AskConversationSummaryView, type AskIdeaView, type AskMessageView, type AskReceiptItemView, type AskTurnResult,
} from "./ask-model";
import { AskChangeFacts, AskChangePanel, AskChangeStory, AskMaking, AskQuestion, AskSample, AskSentLine, askChangeTitle, type AskDecider } from "./AskChange";
import styles from "./ask.module.css";

/** A place the conversation can be about: the whole business (id null) or one System. */
export interface AskScopeOption { id: string | null; label: string; kind?: string; state?: XaComposerScope["state"] }

export interface AskStrelvaProps {
  workspaceId: string;
  businessName: string;
  /** The System this conversation is about (its page), or null on Home. */
  systemId?: string | null;
  systemName?: string;
  /** The System's kind, for its clay tile beside ideas. */
  systemKind?: string;
  /** The System's state for the dot on the scope chip, when known. */
  systemState?: XaComposerScope["state"];
  /** The public address of the website this conversation changes, when known (harbordental.com). */
  address?: string;
  /** Who says yes to a drafted change. Absent: the owner, by the name the business record holds. */
  decider?: AskDecider;
  /** Recorded outcomes of drafted changes, by the draft's item ref. The conversation read supplies these too. */
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
  /** Places this conversation can be about. With onScope, the scope chip opens a picker of them. */
  scopes?: readonly AskScopeOption[];
  onScope?: (id: string | null) => void;
}

type HistoryState = "loading" | "ready" | "unavailable" | "off";

/**
 * Ask Strelva in the workspace (XA · AS1 to AS6). One person's conversation
 * with Strelva about this business (or one System), saved per business. Every
 * finished turn shows what it actually did: answered, drafted (not live),
 * made a new System to try, or filed a Request. A drafted change sits beside
 * the conversation as the page its visitors would see. Nothing typed here
 * approves anything: the yes happens where the decider decides.
 */
export function AskStrelva({ workspaceId, businessName, systemId = null, systemName, systemKind, systemState, address, decider: deciderProp, outcomes: outcomesProp, initialChangeView = "change", initialText = "", readOnly = false, readOnlyReason, compact = false, canAskOnBehalf: initialCanAskOnBehalf = false, request: requestOverride, initialMessages = [], renderResult, refusalLinks, release, scopes, onScope }: AskStrelvaProps) {
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
  const [error, setError] = useState<{ text: string; retry: string | null; saved: boolean | null } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [ideas, setIdeas] = useState<AskIdeaView[] | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [readOutcomes, setReadOutcomes] = useState<Record<string, AskChangeOutcome>>({});
  const [picking, setPicking] = useState(false);
  const historyId = useId();
  const titleId = useId();
  const pickerId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLUListElement>(null);
  const place = systemName ?? businessName;
  const site = address ?? place;
  const decider: AskDecider = deciderProp ?? { name: ownerName ?? "the owner", you: false };
  const outcomes = { ...readOutcomes, ...outcomesProp };

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ workspaceId });
    if (systemId) params.set("systemId", systemId);
    try {
      const response = await request(`/api/workspace/ask?${params}`, { cache: "no-store" });
      if (response.status === 503) { setHistoryState(askHistoryFailure(response.status, await response.json().catch(() => null))); return; }
      if (!response.ok) { setHistoryState("unavailable"); return; }
      const body = await response.json() as { conversations?: AskConversationSummaryView[]; canAskOnBehalf?: boolean; suggestions?: unknown; ideas?: unknown; owner?: unknown };
      setCanAskOnBehalf(body.canAskOnBehalf === true);
      setConversations(Array.isArray(body.conversations) ? body.conversations : []);
      setSuggestions(readAskSuggestions(body.suggestions));
      setIdeas(readAskIdeas(body.ideas));
      setOwnerName(readAskOwner(body.owner));
      setHistoryState("ready");
    } catch {
      setHistoryState("unavailable");
    }
  }, [request, systemId, workspaceId]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { if (initialText) inputRef.current?.focus(); }, [initialText]);
  useEffect(() => { logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight }); }, [messages]);
  useEffect(() => { if (picking) pickerRef.current?.querySelector<HTMLButtonElement>("button[aria-selected='true'], button")?.focus(); }, [picking]);

  async function openConversation(id: string) {
    if (streaming) return;
    setOpening(id);
    setError(null);
    try {
      const params = new URLSearchParams({ workspaceId, conversationId: id });
      const response = await request(`/api/workspace/ask?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { conversation?: { id: string; systemId: string | null; mine: boolean; messages: Array<{ id: string; role: "user" | "assistant"; content: string; result: unknown; askedOnBehalf: "email" | "phone" | null; createdAt?: string }> }; outcomes?: unknown; error?: string } | null;
      if (!response.ok || !body?.conversation) { setError({ text: askErrorMessage(response.status, body?.error ?? null), retry: null, saved: null }); return; }
      setConversationId(body.conversation.id);
      setConversationSystemId(body.conversation.systemId);
      setConversationMine(body.conversation.mine);
      setMessages(body.conversation.messages.map((message) => ({ id: message.id, role: message.role, content: message.content, result: readAskResult(message.result), askedOnBehalf: message.askedOnBehalf, at: message.createdAt ?? null })));
      setReadOutcomes(readAskOutcomes(body.outcomes));
      setHistoryOpen(false);
      setShowThread(false);
    } catch {
      setError({ text: "This conversation couldn't be opened.", retry: null, saved: null });
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
    setReadOutcomes({});
    setError(null);
    setShowThread(false);
    inputRef.current?.focus();
  }

  function focusComposer(words?: string) {
    if (words !== undefined) setInput(words);
    inputRef.current?.focus();
  }

  async function send(event?: FormEvent, words?: string) {
    event?.preventDefault();
    const text = (words ?? input).trim();
    if (!text || streaming || readOnly || !conversationMine) return;
    const userMessage: AskMessageView = { id: `local-${Date.now()}`, role: "user", content: text, result: null, askedOnBehalf: canAskOnBehalf && askedOnBehalf ? askedOnBehalf : null, at: new Date().toISOString() };
    const replyId = `reply-${Date.now()}`;
    const prior = messages.filter((message) => message.content.trim()).slice(-38).map((message) => ({ role: message.role, content: message.content.slice(0, 20_000) }));
    setMessages((current) => [...current, userMessage, { id: replyId, role: "assistant", content: "", result: null, pending: true }]);
    setInput("");
    setError(null);
    setStreaming(true);
    setSteps([]);
    const turn: { result: AskTurnResult | null; accepted: boolean } = { result: null, accepted: false };
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
      // The route saves the person's words before it streams; from here they may be kept.
      turn.accepted = true;
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
      const at = new Date().toISOString();
      setMessages((current) => current.map((message) => message.id === replyId ? { ...message, content: message.content.trim() || "Strelva can't answer right now. Nothing was changed.", result, pending: false, at } : message));
      if (result?.conversationId) {
        setConversationId(result.conversationId);
        void loadConversations();
      }
    } catch (cause) {
      // The person's words go back in the box; nothing was changed.
      setMessages((current) => current.filter((message) => message.id !== replyId && message.id !== userMessage.id));
      setInput(text);
      setError({ text: cause instanceof Error && cause.message ? cause.message : "Strelva can't answer right now. Nothing was changed.", retry: text, saved: turn.accepted ? null : false });
    } finally {
      setStreaming(false);
      setSteps([]);
    }
  }

  const blockedReason = readOnly ? readOnlyReason || "You can read this business's conversations but can't ask here." : !conversationMine ? "This conversation was started by someone else. Start a new one to ask." : null;
  const unsaved = messages.some((message) => message.result && !message.result.saved);
  const empty = messages.length === 0;
  const last = messages.at(-1);
  const openQuestion = !streaming && !blockedReason && last?.role === "assistant" && last.result?.question ? last.result.question : null;
  const draft = compact ? null : latestDraft(messages);
  const outcome = draft ? outcomeFor(draft.item, outcomes) : null;
  const madeItem = !compact && last?.role === "assistant" && !last.pending ? last.result?.items.find(item => item.kind === "possibility" && item.status === "opened") ?? null : null;
  const madeName = madeItem ? madeItem.title ?? (madeItem.summary.replace(/ · Draft$/, "") || null) : null;
  const helpHref = refusalLinks?.help ?? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=help`;
  const todayHref = refusalLinks?.needsYou ?? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=needs-you`;

  // The chip says what the next message is about, with a dot for its state.
  const scopeLabel = madeName ?? (systemName && systemName !== businessName ? `${businessName} · ${systemName}` : businessName);
  const scopeShort = madeName ?? systemName ?? businessName;
  const scopeDot: XaComposerScope["state"] = madeName ? "draft" : systemName ? systemState : blockedReason ? undefined : "live";
  const canPick = Boolean(onScope && scopes && scopes.length > 1 && !madeName);
  const scope: XaComposerScope = { label: scopeLabel, short: scopeShort, ...(scopeDot ? { state: scopeDot } : {}), ...(canPick ? { onPick: () => setPicking(open => !open), picking, pickerId } : {}) };
  const placeholder = blockedReason ?? (madeName ? `Ask for a change to ${madeName}` : empty && !compact ? "Tell Strelva what should happen" : openQuestion ? "Or type the answer" : draft && !outcome ? (decider.you ? "Ask for a change before you decide" : `Ask for a change before ${decider.name} decides`) : `Ask Strelva about ${address ?? place}`);
  const deciderYes = decider.you ? "your yes" : decider.name === "the owner" ? "the owner's yes" : `${decider.name}'s yes`;

  const composer = <XaComposer value={input} onChange={setInput} onSubmit={() => void send()} placeholder={placeholder} inputLabel={`Ask Strelva about ${madeName ?? place}`} scope={scope}
    disabled={Boolean(blockedReason)} busy={streaming} maxLength={20_000} inputRef={inputRef} />;

  const pickerKeys = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setPicking(false); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...(pickerRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  };
  const picker = canPick && picking ? <ul ref={pickerRef} id={pickerId} className={styles.picker} role="listbox" aria-label="What this asks about" onKeyDown={pickerKeys}>
    {scopes!.map(option => {
      const current = option.id === (conversationSystemId ?? null);
      return <li key={option.id ?? "business"} role="presentation">
        <button type="button" role="option" aria-selected={current} onClick={() => { setPicking(false); if (!current) onScope!(option.id); }}>
          {option.kind ? <XaSystemTile kind={option.kind} size={26} /> : <span className={styles.pickerMark} aria-hidden="true"><XaMark size={20} /></span>}
          <span>{option.label}</span>
          {current ? <span className={styles.pickerNow}>Now</span> : null}
        </button>
      </li>;
    })}
  </ul> : null;

  const history = <div className={styles.history}>
    <span className={styles.historyLinks}>
      <button type="button" className={styles.quietLink} aria-expanded={historyOpen} aria-controls={historyId} onClick={() => setHistoryOpen(open => !open)}>Earlier conversations</button>
      {!empty ? <button type="button" className={styles.quietLink} onClick={startNew} disabled={streaming}>New conversation</button> : null}
      {release ? <span className={styles.release}>{release}</span> : null}
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
  </div>;

  const onBehalf = canAskOnBehalf ? <div className={styles.onBehalf}><SelectInput label="Who asked for this?" value={askedOnBehalf} disabled={streaming || Boolean(blockedReason)}
    options={[{ value: "", label: "I am asking" }, { value: "email", label: "The owner, by email" }, { value: "phone", label: "The owner, by phone" }]}
    onChange={event => setAskedOnBehalf(event.target.value as "email" | "phone" | "")}
    helperText={`The owner still decides, on ${XA_PLACE_LABELS.today}.`} /></div> : null;

  // Strelva speaks with one action: the kept words go back with Try again.
  const errorLine = error ? <div className={styles.error} role="alert"><XaPebbleAvatar size={32} /><p>
    {error.text}{" "}
    {error.retry ? <>{error.saved === false ? "Your words weren't sent; they're back in the box. " : "Your words are back in the box. "}<XaTextLink onClick={() => void send(undefined, error.retry!)}>Try again</XaTextLink></> : null}
  </p></div> : null;

  const ideaRows = ideas ?? (suggestions ?? []).map(text => ({ text, kind: systemKind ?? "website", effect: null }));
  const shownIdeas = ideaRows.length ? ideaRows : askIdeas({ businessName, systemName: address ?? systemName, systemKind, aboutSystem: Boolean(systemId) });

  if (empty && !compact) return <section className={styles.ask} data-layout="empty" aria-labelledby={titleId}>
    <div className={styles.intro}>
      <header className={styles.introTop}>{history}</header>
      <div className={styles.introHead}>
        <XaPebbleAvatar size={48} />
        <XaHeadline id={titleId}>What should change for {businessName}?</XaHeadline>
        <p className={styles.introLede}>Say it the way you&apos;d tell a person. Nothing goes public without {deciderYes}.</p>
      </div>
      {onBehalf}
      {errorLine}
      <div className={styles.ideas}>
        <XaLabel id={`${titleId}-ideas`}>Start from what {businessName} needs</XaLabel>
        <XaRows label={`Things to ask about ${businessName}`}>
          {shownIdeas.map(idea => <XaRow key={idea.text} lead={<IdeaTile kind={idea.kind} />} title={idea.text} meta={idea.effect ?? undefined}
            onClick={blockedReason ? undefined : () => focusComposer(idea.text)} />)}
        </XaRows>
      </div>
    </div>
    <XaComposerDock><div className={styles.dockGrid} data-layout="empty"><div className={styles.dockThread}>{picker}{composer}</div></div></XaComposerDock>
  </section>;

  const story = outcome && draft ? <AskChangeStory outcome={outcome} site={site} decider={decider} title={askChangeTitle(draft.item)} helpHref={helpHref}
    onUndo={() => void send(undefined, `Undo this change: ${askChangeTitle(draft.item)}`)} onChange={() => focusComposer()} /> : null;
  const thread = <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-relevant="additions" aria-busy={streaming || undefined} aria-label={`Conversation about ${place}`}>
    {messages.map(message => <Message key={message.id} message={message} place={place} steps={message.pending && message === last ? steps : []}>
      {renderResult?.(message) ?? (message.result ? <TurnResult result={message.result} message={message} latest={message === last} decider={decider} workspaceId={workspaceId} todayHref={todayHref} helpHref={helpHref}
        inlineReview={compact || draft?.message !== message} onChange={() => focusComposer()}
        question={message === last && openQuestion ? <AskQuestion question={openQuestion} onAnswer={words => void send(undefined, words)} onAdd={() => inputRef.current?.focus()} /> : null} /> : null)}
    </Message>)}
  </div>;

  const panel = draft ? <AskChangePanel item={draft.item} site={site} decider={decider} outcome={outcome} initialView={initialChangeView} />
    : madeItem?.explain?.sample ? <AskSample item={madeItem} /> : null;
  const layout = compact ? "compact" : panel ? "split" : "thread";

  return <section className={styles.ask} data-layout={layout} data-story={story ? "true" : undefined} data-thread-open={showThread || undefined} aria-labelledby={titleId}>
    <h1 id={titleId} className={styles.srOnly}>Ask Strelva about {place}</h1>
    <div className={styles.grid}>
      <div className={styles.thread}>
        {compact ? null : <header className={styles.threadTop}>{history}</header>}
        {story}
        {story && !showThread ? <p className={styles.note}><button type="button" className={styles.quietLink} onClick={() => setShowThread(true)}>Show the conversation</button></p> : null}
        {story && !showThread ? null : thread}
        {/* On a phone the change comes first and the thread folds to its last reply. */}
        {!story && panel && !showThread && messages.length > 1 ? <p className={styles.phoneOnly}><button type="button" className={styles.quietLink} onClick={() => setShowThread(true)}>Show the conversation</button></p> : null}
        {errorLine}
        {unsaved ? <p className={styles.note}>Part of this conversation couldn&apos;t be saved. What Strelva drafted or filed is unaffected.</p> : null}
        {onBehalf}
        {compact ? <div className={styles.compactComposer}>{picker}{composer}{history}</div> : null}
      </div>
      {panel ? <aside className={styles.panel} aria-label={draft ? "The change this conversation made" : `How ${madeName ?? "it"} would talk with a customer`}>{panel}</aside> : null}
    </div>
    {compact ? null : <XaComposerDock><div className={styles.dockGrid} data-layout={panel ? "split" : "thread"}><div className={styles.dockThread}>{picker}{composer}</div></div></XaComposerDock>}
  </section>;
}

/** An idea's clay tile: the System it touches, the business record, or Strelva's own record of what changed. */
function IdeaTile({ kind }: { kind: string }) {
  if (kind === "changes") return <span className={styles.ideaMark} aria-hidden="true"><XaMark size={22} /></span>;
  return <XaSystemTile kind={kind === "record" ? "documents" : kind} size={30} />;
}

function outcomeFor(item: AskReceiptItemView, outcomes: Readonly<Record<string, AskChangeOutcome>>): AskChangeOutcome | null {
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
    <XaPebbleAvatar size={32} />
    <div className={styles.saysBody}>
      {message.content ? <p className={styles.text}>{message.content}</p> : null}
      {working}
      {children}
    </div>
  </article>;
}

function TurnResult({ result, message, latest, decider, workspaceId, todayHref, helpHref, question, inlineReview, onChange }: { result: AskTurnResult; message: AskMessageView; latest: boolean; decider: AskDecider; workspaceId: string; todayHref: string; helpHref: string; question: ReactNode; inlineReview: boolean; onChange: () => void }) {
  const refusal = result.kind === "refusal" || Boolean(result.budgetRecovery);
  const headline = result.items.length ? null : resultHeadline(result);
  return <>
    {question}
    {result.items.map((item, index) => <ItemLine key={`${index}:${item.toolId}`} item={item} result={result} decider={decider} at={message.at} latest={latest} inlineReview={inlineReview} onChange={onChange} />)}
    {headline && !result.creationAction && !result.question ? <p className={styles.meta}>{headline}</p> : null}
    {result.creationAction ? <div className={styles.actions}><XaButtonLink variant={latest ? "primary" : "secondary"} href={result.creationAction.href}>{result.creationAction.label}</XaButtonLink></div> : null}
    {refusal ? <p className={styles.links}>
      {result.items.some(item => item.summary === "approval_in_chat") ? <><XaTextLink href={todayHref}>Go to {XA_PLACE_LABELS.today}</XaTextLink><span aria-hidden="true"> · </span></> : null}
      <XaTextLink href={result.budgetRecovery === "plan" ? `/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}` : helpHref}>{result.budgetRecovery === "plan" ? "Choose a plan" : result.items.some(item => item.summary === "budget_paused") ? "Bring in an agency" : "Ask for help"}</XaTextLink>
    </p> : null}
  </>;
}

/** One receipt item as one line: a dot and a word only when something waits or failed. */
function ItemLine({ item, result, decider, at, latest, inlineReview, onChange }: { item: AskReceiptItemView; result: AskTurnResult; decider: AskDecider; at: string | null | undefined; latest: boolean; inlineReview: boolean; onChange: () => void }) {
  const line = receiptLines({ ...result, items: [item] })[0];
  if (!line) return null;
  if (line.tone === "failed") return <p className={styles.line}><XaStatus kind="down" size="sm">Didn&apos;t finish</XaStatus><span>{line.text}</span></p>;
  if (item.kind === "draft" && item.needsYou?.route === "owner_decides") return <>
    <AskChangeFacts item={item} />
    {/* The owner's waiting state lives once, on the change beside the thread; the reply keeps it only without that panel. */}
    {decider.you && !inlineReview ? null : <AskSentLine item={item} decider={decider} at={at} reviewHref={decider.you ? line.decideHref : undefined} />}
  </>;
  if (item.kind === "possibility" && item.status === "opened") return <>
    <p className={styles.line} data-tone="done"><span>I made {item.title ?? (item.summary.replace(/ · Draft$/, "") || "it")}. Nothing is on until {decider.you ? "you turn it on" : `${decider.name} turns it on`}.</span></p>
    {latest ? <AskMaking item={item} decider={decider} onChange={onChange} /> : null}
  </>;
  const by = item.actor ? actorLabel(item.actor) : null;
  return <>
    {item.kind === "draft" ? <AskChangeFacts item={item} /> : null}
    <p className={styles.line} data-tone={line.tone}>
      <span>{line.text}{by && item.kind !== "request" ? ` By ${by}.` : ""}</span>
      {line.openHref || line.decideHref ? <span className={styles.lineLink}>
        {line.openHref ? <XaTextLink href={line.openHref}>{line.openLabel}</XaTextLink> : null}
        {line.openHref && line.decideHref ? <span aria-hidden="true"> · </span> : null}
        {line.decideHref ? <XaTextLink href={line.decideHref}>Go to {XA_PLACE_LABELS.today}</XaTextLink> : null}
      </span> : null}
    </p>
  </>;
}
