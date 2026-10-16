"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { timeAgo } from "@/lib/utils";
import { ShiningText } from "@/components/ui/shining-text";
import { XaComposer, XaPebbleAvatar, XaRow, XaRows, XaSays, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { DashNote, dashboardAskPlaceholder } from "./xa/DashboardXa";
import { useDashboardOptional } from "./DashboardContext";
import { ToolOutput } from "./ToolOutput";
import { SectionErrorBoundary } from "@/components/public/SectionErrorBoundary";
import { queueLead } from "./QueueCard";
import type { AgentResultContract, AgentResultReceipt, AgentResultStatus } from "@/lib/agent-results";
import type { UnifiedEvent } from "@/lib/types";
import type { EditableNode } from "@/lib/editor-types";
import { formatEditablePathValue, getEditablePathValue } from "@/lib/editable-path";
import { ConversationStreamDecoder, type ConversationStreamEvent } from "@/experience/conversation/stream";

/** Things to ask on an empty conversation, each the owner's own words. */
const SUGGESTIONS = [
  "Add this week's update to my site",
  "What should I change next?",
  "Check my site for anything out of date",
];

interface UploadedFile { name: string; url: string }

// Minimal Web Speech API shape — webkitSpeechRecognition isn't in every TS DOM
// lib, so we type only what we touch and feature-detect at runtime.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface ToolCall {
  id: string;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  result?: unknown;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

interface UpdateToast {
  status: AgentResultStatus;
  text: string;
  detail: string;
  proof: string;
  nextAction: AgentResultReceipt["nextAction"];
}

interface AgentNodeContextPayload {
  selectedSection: string;
  selectedField?: string;
  currentValue?: string;
}

interface ChatPanelProps {
  threadId?: string;
  ownerName: string;
  onThreadCreated?: (id: string) => void;
  variant?: "full" | "compact";
  needsYou?: {
    openInitially?: boolean;
    pending: UnifiedEvent[];
    resolved: UnifiedEvent[];
    pendingCount: number;
    staleSectionCount: number;
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const TRANSIENT_CONNECT_FAILURE = "Sorry, I couldn't connect. Please try again.";

function makeClientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isTransientFailureMessage(message: ChatMessage) {
  return message.role === "assistant" && message.content.trim() === TRANSIENT_CONNECT_FAILURE;
}

async function buildSelectedNodeContext(
  node: EditableNode | null | undefined,
  dashboardHref: (path: string) => string
): Promise<AgentNodeContextPayload | undefined> {
  if (!node?.section) return undefined;

  let currentValue: string | undefined;
  if (node.field) {
    try {
      const res = await fetch(
        dashboardHref(`/api/content/${encodeURIComponent(node.section)}?draft=true`),
        { credentials: "same-origin" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object" && !Array.isArray(data)) {
          currentValue = formatEditablePathValue(
            getEditablePathValue(data as Record<string, unknown>, node.field)
          );
        }
      }
    } catch {
      // Best effort only. The agent can still read the section through tools.
    }
  }

  return {
    selectedSection: node.section,
    selectedField: node.field,
    currentValue: currentValue || node.label,
  };
}

export function ChatPanel({ threadId, ownerName, onThreadCreated, variant = "full", needsYou }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updateToast, setUpdateToast] = useState<UpdateToast | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  // Rich inline tool cards (report/content/photos/connections) streamed via __CARD__.
  const [toolCards, setToolCards] = useState<{ id: string; tool: string; data: unknown }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [micSupported, setMicSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentThreadRef = useRef<string | undefined>(threadId);
  const optimisticThreadRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolIdCounterRef = useRef(0);
  const previousMessageCountRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);

  const dashCtx = useDashboardOptional();
  const clockNow = dashCtx?.fixtureNow;
  const readOnly = dashCtx?.readOnly ?? false;
  const contextDashboardHref = dashCtx?.dashboardHref;
  const dashboardHref = useCallback(
    (path: string) => contextDashboardHref?.(path) ?? path,
    [contextDashboardHref]
  );
  const pendingNeedsCount = needsYou?.pendingCount ?? 0;
  const selectedObjectLabel =
    dashCtx?.selectedNode?.label ||
    dashCtx?.selectedNode?.field ||
    dashCtx?.selectedNode?.section ||
    dashCtx?.activeSection;

  const showResultToast = useCallback((result: AgentResultContract) => {
    if (result.status === "no-op" && result.actions.length === 1) return;

    setUpdateToast({
      status: result.status,
      text: result.receipt.title,
      detail: result.receipt.detail,
      proof: result.receipt.proof,
      nextAction: result.receipt.nextAction,
    });
    if (result.status === "published" || result.status === "applied") {
      dashCtx?.triggerRefresh();
    }
  }, [dashCtx]);

  // Load thread messages when threadId changes
  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      currentThreadRef.current = undefined;
      return;
    }

    if (optimisticThreadRef.current === threadId) {
      currentThreadRef.current = threadId;
      return;
    }

    currentThreadRef.current = threadId;

    fetch(dashboardHref(`/api/threads/${threadId}`), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((thread) => {
        if (thread && thread.messages && currentThreadRef.current === threadId) {
          setMessages(
            thread.messages
              .map((m: { id: string; role: string; content: string; timestamp: string }) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                timestamp: new Date(m.timestamp).getTime(),
              }))
              .filter((message: ChatMessage) => !isTransientFailureMessage(message))
          );
        }
      })
      .catch(() => {});
  }, [dashboardHref, threadId]);

  // Watch for chatPrompt changes from content card clicks
  useEffect(() => {
    if (dashCtx?.chatPrompt) {
      setInput(dashCtx.chatPrompt);
      dashCtx.setChatPrompt("");
      inputRef.current?.focus();
    }
  }, [dashCtx?.chatPrompt, dashCtx]);

  const updateShouldStickToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 120;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const previousCount = previousMessageCountRef.current;
    const messageCountChanged = messages.length !== previousCount;
    previousMessageCountRef.current = messages.length;

    if (messageCountChanged) {
      shouldStickToBottomRef.current = true;
      requestAnimationFrame(() => {
        const target = scrollRef.current;
        if (!target) return;
        target.scrollTo({
          top: target.scrollHeight,
          behavior: previousCount === 0 ? "auto" : "smooth",
        });
      });
      return;
    }

    if (!shouldStickToBottomRef.current) return;

    requestAnimationFrame(() => {
      const target = scrollRef.current;
      if (!target) return;
      target.scrollTop = target.scrollHeight;
    });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return;
    inputRef.current?.focus();
  }, []);

  // Voice input via the Web Speech API. Feature-detected so the mic button is
  // hidden entirely on browsers without it (Firefox, some Safari builds).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      // Permission denied is terminal — hide the button rather than leave a
      // control that will only ever error.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicSupported(false);
      }
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    setMicSupported(true);
    return () => {
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
      recognitionRef.current = null;
    };
  }, []);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
      setIsListening(false);
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // start() throws if called while already running — reset state.
      setIsListening(false);
    }
  }, [isListening]);

  const uploadFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(dashboardHref("/api/upload"), { method: "POST", credentials: "same-origin", body: formData });
        if (!response.ok) continue;
        const body = await response.json().catch(() => null);
        if (typeof body?.url === "string") uploaded.push({ name: file.name, url: body.url });
      }
      if (uploaded.length) {
        setAttachments((current) => [...current, ...uploaded]);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [dashboardHref, uploading]);

  const sendChat = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      const abortController = new AbortController();
      abortRef.current = abortController;

      const attachmentContext = attachments.length
        ? `\n\nAttached files:\n${attachments.map((file) => `- ${file.name}: ${file.url}`).join("\n")}`
        : "";
      const outboundText = `${text}${attachmentContext}`;

      const userMsg: ChatMessage = {
        id: makeClientId("user"),
        role: "user",
        content: outboundText,
        timestamp: Date.now(),
      };

      const allMessages = messages.filter((message) => !isTransientFailureMessage(message)).concat(userMsg);
      setMessages(allMessages);
      setInput("");
      setAttachments([]);
      setIsLoading(true);
      setToolStatus("Reading your question");
      setToolCards([]);

      const slowStatusTimer = window.setTimeout(() => {
        if (!abortController.signal.aborted) setToolStatus("Reading your site");
      }, 2500);
      const longStatusTimer = window.setTimeout(() => {
        if (!abortController.signal.aborted) setToolStatus("Still working. Stop it any time to change the ask.");
      }, 12000);

      // If no threadId, create a new thread first
      let activeThreadId = threadId;
      let createdThreadId: string | null = null;
      let revealTimer: number | null = null;
      if (!activeThreadId) {
        try {
          const createRes = await fetch(dashboardHref("/api/threads"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            signal: abortController.signal,
            body: JSON.stringify({ title: text.slice(0, 50) }),
          });
          if (createRes.ok) {
            const newThread = await createRes.json();
            activeThreadId = newThread.id as string;
            createdThreadId = activeThreadId;
            currentThreadRef.current = activeThreadId;
            optimisticThreadRef.current = activeThreadId;
          }
        } catch {
          // Continue without thread persistence
        }
      }

      // Custom-change-request classification is the AGENT's job, server-side: its
      // `request_custom_change` tool decides (with full context + the one-active-
      // request gate). The old client-side regex here fired on innocent words like
      // "design"/"customize", auto-creating a request that tripped the one-open
      // wall and blocked legitimate ones. Removed — don't classify on the client.

      try {
        const nodeContext = await buildSelectedNodeContext(
          dashCtx?.selectedNode,
          dashboardHref
        );

        const res = await fetch(dashboardHref("/api/agent"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: abortController.signal,
          body: JSON.stringify({
            messages: allMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            activeSection: dashCtx?.activeSection || null,
            nodeContext,
            threadId: activeThreadId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: `Sorry, something went wrong: ${err.error || res.statusText}`,
              timestamp: Date.now(),
            },
          ]);
          setIsLoading(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setIsLoading(false);
          return;
        }

        const assistantId = makeClientId("assistant");
        const assistantTs = Date.now();
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", timestamp: assistantTs },
        ]);

        const streamDecoder = new ConversationStreamDecoder<AgentResultContract, { __inlineTool?: string }>();
        let fullText = "";
        let visibleText = "";
        let agentResult: AgentResultContract | null = null;
        let streamFinished = false;
        let finishReveal: (() => void) | null = null;
        const revealComplete = new Promise<void>((resolve) => {
          finishReveal = resolve;
        });
        revealTimer = window.setInterval(() => {
          if (abortController.signal.aborted) {
            if (revealTimer !== null) window.clearInterval(revealTimer);
            revealTimer = null;
            finishReveal?.();
            return;
          }

          if (visibleText.length < fullText.length) {
            const remaining = fullText.length - visibleText.length;
            const step = remaining > 600 ? 4 : 2;
            visibleText = fullText.slice(0, visibleText.length + step);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: visibleText.trimEnd() } : m
              )
            );
            return;
          }

          if (streamFinished) {
            if (revealTimer !== null) window.clearInterval(revealTimer);
            revealTimer = null;
            finishReveal?.();
          }
        }, 28);

        const applyStreamEvents = (events: ConversationStreamEvent<AgentResultContract, { __inlineTool?: string }>[]) => {
          for (const event of events) {
            if (event.type === "tool") {
              setToolStatus(event.label);
              continue;
            }
            if (event.type === "result") {
              agentResult = event.result;
              continue;
            }
            if (event.type === "tool-done") {
              // Consume the marker (cards are tracked via __CARD__ now).
              continue;
            }
            if (event.type === "card") {
              const card = event.card;
              if (card?.__inlineTool) {
                setToolCards((prev) => [
                  ...prev,
                  { id: makeClientId(`card_${toolIdCounterRef.current++}`), tool: card.__inlineTool!, data: card },
                ]);
              }
              continue;
            }
            fullText += event.text;
            if (fullText) setToolStatus(null);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          applyStreamEvents(streamDecoder.push(value));
        }
        applyStreamEvents(streamDecoder.finish());
        streamFinished = true;
        await revealComplete;
        setToolStatus(null);

        // Save messages to thread
        if (activeThreadId) {
          const finalMessages = allMessages.concat({
            id: assistantId,
            role: "assistant",
            content: fullText.trimEnd(),
            timestamp: assistantTs,
          });
          fetch(dashboardHref(`/api/threads/${activeThreadId}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              messages: finalMessages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: new Date(m.timestamp).toISOString(),
              })),
            }),
          }).catch(() => {});
          optimisticThreadRef.current = null;
          if (createdThreadId) onThreadCreated?.(createdThreadId);
        }

        if (agentResult) showResultToast(agentResult);
      } catch (error) {
        if (abortRef.current) {
          // The interval may still be active if the stream was aborted before
          // it naturally drained.
          setToolStatus(null);
        }
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessages((prev) => [
          ...prev,
          {
            id: makeClientId("assistant_error"),
            role: "assistant",
            content: TRANSIENT_CONNECT_FAILURE,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        window.clearTimeout(slowStatusTimer);
        window.clearTimeout(longStatusTimer);
        if (abortRef.current === abortController) {
          if (revealTimer !== null) {
            window.clearInterval(revealTimer);
            revealTimer = null;
          }
          abortRef.current = null;
          setIsLoading(false);
          setToolStatus(null);
        }
      }
    },
    [attachments, dashboardHref, messages, isLoading, threadId, onThreadCreated, dashCtx, showResultToast]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setToolStatus(null);
  }, []);

  const isEmpty = messages.length === 0 && !isLoading;
  const lastMessage = messages[messages.length - 1];
  const showThinkingBubble =
    isLoading &&
    lastMessage?.role === "user";

  useLayoutEffect(() => {
    if (!isEmpty) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  }, [isEmpty]);

  useEffect(() => {
    if (!isEmpty) return;
    const resetScroll = () => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    };
    resetScroll();
    const frame = requestAnimationFrame(resetScroll);
    const timeout = window.setTimeout(resetScroll, 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [isEmpty]);

  // The change this conversation drafted, if one waits: the newest pending
  // item made since the conversation started. It is shown inline as the thing
  // itself, with "See it" opening it in Needs you.
  const conversationStart = messages[0]?.timestamp ?? Number.POSITIVE_INFINITY;
  const drafted = needsYou?.pending
    .filter((event) => event.status === "pending" && event.type !== "change_request" && new Date(event.createdAt).getTime() >= conversationStart - 5 * 60_000)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const needsYouHref = dashboardHref("/dashboard/review");
  const compact = variant === "compact";

  return (
    <div className={`relative flex h-full w-full flex-col ${compact ? "bg-surface" : ""}`}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={updateShouldStickToBottom}>
        {isEmpty ? (
          /* Empty (XA · AS1): Pebble greets, says what waits, offers three asks. */
          <div className={`flex min-h-full flex-col justify-start gap-6 ${compact ? "px-4 pb-8 pt-6" : "mx-auto w-full max-w-[680px] px-4 pb-10 pt-12 sm:justify-center sm:px-6"}`}>
            <XaPebbleAvatar size={compact ? 36 : 48} />
            <h1 className={`m-0 ${compact ? "text-[22px]" : "text-[30px] sm:text-[40px]"} font-medium tracking-[-0.8px] text-[var(--st-text)]`} suppressHydrationWarning>
              {getGreeting()}, {ownerName}.
              <span className="block text-[var(--st-text-3)]">Say the change in your own words.</span>
            </h1>
            {!compact && pendingNeedsCount > 0 ? (
              <XaSays links={[<XaTextLink key="open" href={needsYouHref}>Open Needs you</XaTextLink>]}>
                {pendingNeedsCount === 1 ? "One change waits" : `${pendingNeedsCount} changes wait`} for your yes from earlier.
              </XaSays>
            ) : null}
            <XaRows label="Things to ask">
              {SUGGESTIONS.slice(0, compact ? 2 : SUGGESTIONS.length).map((ask) => (
                <XaRow key={ask} title={ask} onClick={() => { setInput(ask); requestAnimationFrame(() => inputRef.current?.focus()); }} />
              ))}
            </XaRows>
          </div>
        ) : messages.length === 0 && isLoading ? (
          <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col justify-center px-4 py-12 sm:px-6">
            <XaWorking title={toolStatus || "Reading your question"} steps={[{ id: "read", label: toolStatus || "Reading your site and your question", state: "active" }]} />
          </div>
        ) : (
          /* A conversation (XA · AS2): your words, Strelva's answer, and the thing it made. */
          <div className={`${compact ? "px-3 py-4" : "mx-auto w-full max-w-[680px] px-4 py-6 sm:px-6 sm:py-10"} flex flex-col gap-6`}>
            {messages.map((message) => (
              message.role === "user" ? (
                <div key={message.id} className="flex flex-col items-end gap-1">
                  <p className={`m-0 max-w-[86%] whitespace-pre-wrap rounded-[var(--st-r-lg)] bg-[var(--st-inset)] px-4 py-2.5 ${compact ? "text-[14px]" : "text-[15px]"} leading-[1.5] text-[var(--st-text)]`}>{message.content}</p>
                  <span className="px-1 text-[12px] text-[var(--st-text-3)]">You · {timeAgo(message.timestamp, clockNow)}</span>
                </div>
              ) : (
                <div key={message.id} className="flex items-start gap-3">
                  <XaPebbleAvatar size={28} label="Strelva" />
                  <div className="min-w-0 flex-1">
                    {message.content ? (
                      <div className={`chat-markdown whitespace-pre-wrap ${compact ? "text-[14px]" : "text-[15px]"} leading-[1.55] text-[var(--st-text)] ai-output-pop`}>
                        <ReactMarkdown>{message.content.replace(/\\n/g, "\n")}</ReactMarkdown>
                      </div>
                    ) : (
                      <ShiningText text={toolStatus || "Strelva is thinking"} className="text-[14px] font-medium" />
                    )}
                    <span className="mt-1 block text-[12px] text-[var(--st-text-3)]">Strelva · {timeAgo(message.timestamp, clockNow)}</span>
                  </div>
                </div>
              )
            ))}

            {showThinkingBubble && (
              <div className="flex items-start gap-3">
                <XaPebbleAvatar size={28} label="Strelva" />
                <ShiningText text={toolStatus || "Strelva is thinking"} className="pt-1 text-[14px] font-medium" />
              </div>
            )}

            {toolCards.length > 0 && (
              <div className="flex flex-col gap-4 pl-10">
                {toolCards.map((card) => (
                  // Contain a malformed card payload to its own answer.
                  <SectionErrorBoundary key={card.id}>
                    <ToolOutput toolName={card.tool} result={card.data} status="complete" />
                  </SectionErrorBoundary>
                ))}
              </div>
            )}

            {drafted && !isLoading ? (
              <div className={compact ? "" : "pl-10"}>
                <XaRows label="What this made">
                  <XaRow lead={queueLead(drafted, 32)} title={drafted.title} detail="Waits for your yes on Home" tone="waits"
                    action={<XaTextLink href={needsYouHref} aria-label={`See it: ${drafted.title}`}>See it</XaTextLink>} />
                </XaRows>
              </div>
            ) : null}

            {updateToast && (
              <div role="status">
                <XaSays links={[
                  ...(updateToast.nextAction === "view_site" ? [<a key="site" href={dashCtx?.siteUrl || dashboardHref("/dashboard/site")} target={dashCtx?.siteUrl ? "_blank" : undefined} rel={dashCtx?.siteUrl ? "noopener noreferrer" : undefined} className="font-medium text-[var(--st-accent)] hover:underline">View site</a>] : []),
                  ...(updateToast.nextAction === "review_queue" ? [<Link key="needs" href={needsYouHref} className="font-medium text-[var(--st-accent)] hover:underline">Open Needs you</Link>] : []),
                  <XaTextLink key="close" onClick={() => setUpdateToast(null)} aria-label="Dismiss this note">Dismiss</XaTextLink>,
                ]}>
                  {updateToast.text}. {updateToast.detail} {updateToast.proof}
                </XaSays>
              </div>
            )}
          </div>
        )}
      </div>

      {/* The composer: one field, add a photo, say it, send. */}
      <div className={`${compact ? "px-3 pb-3 pt-2" : "px-4 pb-4 pt-3 sm:px-6 sm:pb-6"} keyboard-safe shrink-0`}>
        <div className="mx-auto flex max-w-[680px] flex-col gap-2">
          {readOnly ? (
            <DashNote tone="quiet" links={[<Link key="own" href="/access-request" className="font-medium text-[var(--st-accent)] hover:underline">Get your own site</Link>]}>This is a demo you can look around. Asking is off here.</DashNote>
          ) : (
            <>
              {attachments.length > 0 ? (
                <p className="m-0 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--st-text-2)]">
                  {attachments.map((file) => <span key={file.url} className="rounded-full bg-[var(--st-chip)] px-2.5 py-1 text-[var(--st-text-body)]">{file.name}</span>)}
                </p>
              ) : null}
              {isLoading || uploading ? <p className="m-0 flex flex-wrap gap-x-3 text-[13px] text-[var(--st-text-2)]" role="status">
                {isLoading ? <span>{toolStatus || "Strelva is working"} · <XaTextLink onClick={handleStop}>Stop</XaTextLink></span> : <span>Adding your photo</span>}
              </p> : null}
              {isListening ? <p className="m-0 text-[13px] text-[var(--st-text-2)]" role="status">Listening. Press the microphone again to stop.</p> : null}
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(event) => void uploadFiles(event.target.files)} aria-hidden="true" tabIndex={-1} />
              <XaComposer
                value={input}
                onChange={setInput}
                onSubmit={() => void sendChat(input)}
                inputRef={inputRef}
                busy={isLoading}
                placeholder={dashboardAskPlaceholder(compact && selectedObjectLabel ? selectedObjectLabel : "your website")}
                scope={compact ? undefined : { label: "Your website" }}
                onAdd={() => fileInputRef.current?.click()}
                onVoice={micSupported ? toggleListening : undefined}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
