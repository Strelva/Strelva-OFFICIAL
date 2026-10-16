"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Clock,
  CalendarPlus,
  Mail,
  BarChart3,
  AlertCircle,
  Mic,
  MicOff,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { timeAgo } from "@/lib/utils";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import type { UploadedFile } from "@/components/ui/ai-prompt-box";
import { ShiningText } from "@/components/ui/shining-text";
import { XaIconButton, XaPebbleAvatar, XaSays, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { DashNote } from "./xa/DashboardXa";
import { useDashboardOptional } from "./DashboardContext";
import { ToolOutput } from "./ToolOutput";
import { SectionErrorBoundary } from "@/components/public/SectionErrorBoundary";
import { QueuePage } from "./QueuePage";
import type { AgentResultContract, AgentResultReceipt, AgentResultStatus } from "@/lib/agent-results";
import type { UnifiedEvent } from "@/lib/types";
import type { EditableNode } from "@/lib/editor-types";
import { formatEditablePathValue, getEditablePathValue } from "@/lib/editable-path";
import { ConversationStreamDecoder, type ConversationStreamEvent } from "@/experience/conversation/stream";

const SUGGESTION_CHIPS = [
  { label: "Add this week's update", icon: Clock, description: "Tell me what changed and I'll update the site for you" },
  { label: "Write this week's customer update", icon: CalendarPlus, description: "I'll turn the change into something ready to share with customers" },
  { label: "Email customers about it", icon: Mail, description: "I'll draft a short note your customers can receive", hideOnMobile: true },
  { label: "What should I work on next?", icon: BarChart3, description: "I'll look at what's working and suggest the next thing to do" },
];

const INPUT_QUICK_ACTIONS = [
  {
    label: "What's working?",
    icon: BarChart3,
    description: "Summarize visits, clicks, updates, and what you are watching.",
    message: "Give me a plain-English overview of what's working on my site right now. Include recent site changes, traffic or click signals if available, approvals waiting, and what you're watching for the next weekly report.",
  },
  {
    label: "Suggest an update",
    icon: Clock,
    description: "Pick the most useful small change for the site today.",
    message: "Suggest the most useful small website update I should make today. Explain why it matters and ask for any missing details before changing anything.",
  },
  {
    label: "Show recent changes",
    icon: CalendarPlus,
    description: "Review what Strelva or your team changed lately.",
    message: "Show me the recent changes made to my site and call out anything that belongs in Needs You or needs a closer look.",
  },
  {
    label: "Check site health",
    icon: AlertCircle,
    description: "Look for stale content, weak CTAs, missing info, and issues.",
    message: "Check my site health. Look for stale content, missing business details, weak calls to action, broken or risky areas, and the next practical fix.",
  },
];

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
  const [needsDrawerOpen, setNeedsDrawerOpen] = useState(Boolean(needsYou?.openInitially));
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

  useEffect(() => {
    if (needsYou?.openInitially) setNeedsDrawerOpen(true);
  }, [needsYou?.openInitially]);

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
      setToolStatus("Contacting AI...");
      setToolCards([]);

      const slowStatusTimer = window.setTimeout(() => {
        if (!abortController.signal.aborted) setToolStatus("Checking the site context...");
      }, 2500);
      const longStatusTimer = window.setTimeout(() => {
        if (!abortController.signal.aborted) setToolStatus("Still working. You can stop this if you want to revise the ask.");
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

  return (
    <div className={`relative flex h-full flex-col ${variant === "compact" ? "bg-surface" : ""}`}>
      {/* Scrollable content area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={updateShouldStickToBottom}
      >
        {isEmpty ? (
          /* Empty state (XA · AS1): a greeting, what waits, a few things to ask. */
          <div className={`flex min-h-full flex-col justify-start gap-7 ${variant === "compact" ? "px-4 pb-8 pt-6" : "mx-auto w-full max-w-[680px] px-4 pb-10 pt-12 sm:justify-center sm:px-6"}`}>
            <XaPebbleAvatar size={variant === "compact" ? 36 : 48} />
            <h1 className={`m-0 ${variant === "compact" ? "text-[22px]" : "text-[30px] sm:text-[40px]"} font-medium tracking-[-0.8px] text-[var(--st-text)]`} suppressHydrationWarning>
              {getGreeting()}, {ownerName}.
              <span className="block text-[var(--st-text-3)]">Tell me the change. I make it, or show you what needs your yes first.</span>
            </h1>
            {variant !== "compact" && pendingNeedsCount > 0 ? (
              <XaSays links={[<XaTextLink key="open" onClick={() => setNeedsDrawerOpen(true)}>Open them here</XaTextLink>]}>
                {pendingNeedsCount === 1 ? "One change waits" : `${pendingNeedsCount} changes wait`} for your yes.
              </XaSays>
            ) : null}
            <div className="flex flex-wrap gap-2" aria-label="Things to ask">
              {SUGGESTION_CHIPS.slice(0, variant === "compact" ? 2 : SUGGESTION_CHIPS.length).map((chip) => (
                <button key={chip.label} type="button" onClick={() => sendChat(chip.label)} title={chip.description}
                  className={`${chip.hideOnMobile ? "hidden sm:inline-flex" : "inline-flex"} min-h-[40px] items-center rounded-full bg-[var(--st-surface)] px-4 text-[14px] text-[var(--st-text)] shadow-[0_1px_2px_#0000000f] transition-colors duration-(--motion-fast) hover:bg-[var(--st-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-accent)]`}>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : messages.length === 0 && isLoading ? (
          <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col justify-center px-4 py-12 sm:px-6">
            <XaWorking title={toolStatus || "Strelva is reading your question"} steps={[{ id: "read", label: toolStatus || "Reading your site and your question", state: "active" }]} />
          </div>
        ) : (
          /* Active conversation (XA · AS2) */
          <div className={`${variant === "compact" ? "px-3 py-4" : "mx-auto w-full max-w-[680px] px-4 py-6 sm:px-6 sm:py-8"} flex flex-col gap-5`}>
            {updateToast && (
              <DashNote
                tone={updateToast.status === "published" || updateToast.status === "applied" ? "live" : updateToast.status === "drafted" || updateToast.status === "queued" ? "waits" : "down"}
                role="status"
                links={[
                  ...(updateToast.nextAction === "view_site" ? [<a key="site" href={dashCtx?.siteUrl || "/dashboard/site"} target={dashCtx?.siteUrl ? "_blank" : undefined} rel={dashCtx?.siteUrl ? "noopener noreferrer" : undefined} className="font-medium text-[var(--st-accent)] hover:underline">View site</a>] : []),
                  ...(updateToast.nextAction === "review_queue" ? [<Link key="needs" href={dashCtx?.dashboardHref("/dashboard/review") || "/dashboard/review"} className="font-medium text-[var(--st-accent)] hover:underline">Open Needs you</Link>] : []),
                  <XaTextLink key="close" onClick={() => setUpdateToast(null)} aria-label="Dismiss update message">Dismiss</XaTextLink>,
                ]}
              >
                <strong className="font-medium">{updateToast.text}</strong> {updateToast.detail} <span className="text-[var(--st-text-2)]">{updateToast.proof}</span>
              </DashNote>
            )}

            {messages.map((message) => (
              message.role === "user" ? (
                <div key={message.id} className="flex flex-col items-end gap-1">
                  <p className={`m-0 max-w-[86%] whitespace-pre-wrap rounded-[20px] bg-[var(--st-hover)] px-4 py-2.5 ${variant === "compact" ? "text-[14px]" : "text-[15px]"} leading-[1.5] text-[var(--st-text)]`}>{message.content}</p>
                  <span className="px-1 text-[12px] text-[var(--st-text-3)]">{timeAgo(message.timestamp)}</span>
                </div>
              ) : (
                <div key={message.id} className="flex items-start gap-3">
                  <XaPebbleAvatar size={28} label="Strelva" />
                  <div className="min-w-0 flex-1">
                    {message.content ? (
                      <div className={`chat-markdown whitespace-pre-wrap ${variant === "compact" ? "text-[14px]" : "text-[15px]"} leading-[1.55] text-[var(--st-text)] ${message.content ? "ai-output-pop" : ""}`}>
                        <ReactMarkdown>{message.content.replace(/\\n/g, "\n")}</ReactMarkdown>
                      </div>
                    ) : (
                      <ShiningText text={toolStatus || "Strelva is thinking"} className="text-[14px] font-medium" />
                    )}
                    <span className="mt-1 block text-[12px] text-[var(--st-text-3)]">{timeAgo(message.timestamp)}</span>
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

            {/* Rich inline tool cards (report / content / photos / connections) */}
            {toolCards.length > 0 && (
              <div className="flex justify-start pl-10">
                <div className="w-full max-w-[600px] space-y-2">
                  {toolCards.map((card) => (
                    // Contain a malformed card payload to its own bubble — a crash
                    // here used to take down the whole conversation.
                    <SectionErrorBoundary key={card.id}>
                      <ToolOutput toolName={card.tool} result={card.data} status="complete" />
                    </SectionErrorBoundary>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat input - always at bottom, with safe area for notched devices */}
      <div className={`${variant === "compact" ? "px-3 pb-3 pt-2" : "px-4 pb-4 pt-3 sm:px-6 sm:pb-6"} keyboard-safe shrink-0`}>
        <div className="mx-auto max-w-[680px]">
          {readOnly ? (
            <DashNote tone="quiet" links={[<Link key="own" href="/access-request" className="font-medium text-[var(--st-accent)] hover:underline">Get your own site</Link>]}>This is a demo you can look around. Asking is off here.</DashNote>
          ) : (
          <>
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((file) => (
                <span key={file.url} className="rounded-full bg-[var(--st-chip)] px-2.5 py-1 text-[13px] text-[var(--st-text-body)]">
                  {file.name}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            {micSupported && (
              <button
                type="button"
                onClick={toggleListening}
                aria-pressed={isListening}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                title={isListening ? "Stop voice input" : "Speak your message"}
                className={`mb-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isListening
                    ? "bg-[var(--st-tint)] text-[var(--st-accent)]"
                    : "bg-[var(--st-surface)] text-[var(--st-text-2)] shadow-[0_1px_2px_#0000000f] hover:text-[var(--st-text)]"
                }`}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Mic className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <PromptInputBox
                ref={inputRef}
                value={input}
                onValueChange={setInput}
                onSend={sendChat}
                onFilesUploaded={(files) => setAttachments((current) => [...current, ...files])}
                onStop={handleStop}
                isLoading={isLoading}
                placeholder={
                  variant === "compact" && selectedObjectLabel
                    ? `Ask Strelva about ${selectedObjectLabel}`
                    : "Ask Strelva for a change to your site"
                }
                quickActions={INPUT_QUICK_ACTIONS}
                className={variant === "compact" ? "rounded-2xl" : undefined}
              />
            </div>
          </div>

          </>
          )}
        </div>
      </div>
      {needsYou && variant !== "compact" && needsDrawerOpen && (
        <>
          <button
            type="button"
            className="absolute inset-0 z-30 bg-[#1617155c]"
            onClick={() => setNeedsDrawerOpen(false)}
            aria-label="Close Needs you"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Needs you"
            className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[560px] flex-col overflow-y-auto bg-[var(--st-canvas)] px-5 pb-8 pt-4 shadow-[var(--st-shadow-lg)] animate-overlay-enter"
          >
            <div className="flex justify-end">
              <XaIconButton label="Close Needs you" tone="plain" onClick={() => setNeedsDrawerOpen(false)}><X className="h-4 w-4" strokeWidth={1.7} /></XaIconButton>
            </div>
            <QueuePage
              initialPending={needsYou.pending}
              initialResolved={needsYou.resolved}
              pendingCount={needsYou.pendingCount}
              staleSectionCount={needsYou.staleSectionCount}
              compact
            />
          </aside>
        </>
      )}
    </div>
  );
}
