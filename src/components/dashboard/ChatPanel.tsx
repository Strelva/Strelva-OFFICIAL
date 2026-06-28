"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Clock,
  CalendarPlus,
  Mail,
  BarChart3,
  ExternalLink,
  Inbox,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { timeAgo } from "@/lib/utils";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import type { UploadedFile } from "@/components/ui/ai-prompt-box";
import { ShiningText } from "@/components/ui/shining-text";
import { useDashboardOptional } from "./DashboardContext";
import { ToolOutput } from "./ToolOutput";
import { SectionErrorBoundary } from "@/components/public/SectionErrorBoundary";
import { QueuePage } from "./QueuePage";
import type { AgentResultContract, AgentResultReceipt, AgentResultStatus } from "@/lib/agent-results";
import type { UnifiedEvent } from "@/lib/types";
import type { EditableNode } from "@/lib/editor-types";
import { formatEditablePathValue, getEditablePathValue } from "@/lib/editable-path";

const SUGGESTION_CHIPS = [
  { label: "Add this week's update", icon: Clock, description: "Turn a real business change into updated site copy" },
  { label: "Write this week's customer update", icon: CalendarPlus, description: "Create timely content from what changed in the business" },
  { label: "Email customers about it", icon: Mail, description: "Turn a site update into a customer-ready note", hideOnMobile: true },
  { label: "What should I improve next?", icon: BarChart3, description: "Use traffic, product interest, and freshness to pick the next move" },
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
    description: "Review what the AI or team changed lately.",
    message: "Show me the recent changes made to my site and call out anything that belongs in Needs You or needs a closer look.",
  },
  {
    label: "Check site health",
    icon: AlertCircle,
    description: "Look for stale content, weak CTAs, missing info, and issues.",
    message: "Check my site health. Look for stale content, missing business details, weak calls to action, broken or risky areas, and the next practical fix.",
  },
];

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

function inferCustomRequestKind(text: string): "custom_design" | "template" | "infrastructure" {
  if (/\b(template|component|section type|layout system)\b/i.test(text)) return "template";
  if (/\b(infra|infrastructure|domain|routing|integration|schema|database|analytics|tracking|navigation)\b/i.test(text)) {
    return "infrastructure";
  }
  return "custom_design";
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
  const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
  const [needsDrawerOpen, setNeedsDrawerOpen] = useState(Boolean(needsYou?.openInitially));
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
      setActiveTools([]);

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

      if (/custom (site|design|code)|scaffold web request|beyond normal content/i.test(text)) {
        fetch(dashboardHref("/api/change-requests"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            prompt: text,
            requestKind: inferCustomRequestKind(text),
            page: dashCtx?.activePage,
            section: dashCtx?.selectedNode?.section || dashCtx?.activeSection,
            field: dashCtx?.selectedNode?.field,
            label: dashCtx?.selectedNode?.label || dashCtx?.activeSection || "AI chat request",
            nodeType: dashCtx?.selectedNode?.nodeType,
            rect: dashCtx?.selectedNode?.rect,
          }),
        }).catch(() => {});
      }

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

        const decoder = new TextDecoder();
        let fullText = "";
        let visibleText = "";
        let buffer = "";
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("__TOOL__")) {
              const toolInfo = line.slice(8);
              setToolStatus(toolInfo);
              // Track tool calls
              const toolId = makeClientId(`tool_${toolIdCounterRef.current++}`);
              setActiveTools((prev) => [
                ...prev,
                { id: toolId, name: toolInfo, status: "running" as const },
              ]);
              continue;
            }
            if (line.startsWith("__RESULT__")) {
              try {
                agentResult = JSON.parse(line.slice(10)) as AgentResultContract;
              } catch {
                agentResult = null;
              }
              continue;
            }
            if (line.startsWith("__TOOL_DONE__")) {
              const toolName = line.slice(13);
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.name === toolName && t.status === "running"
                    ? { ...t, status: "complete" as const }
                    : t
                )
              );
              continue;
            }
            fullText += line + "\n";
          }

          if (
            buffer &&
            !buffer.startsWith("__TOOL__") &&
            !buffer.startsWith("__TOOL_DONE__") &&
            !buffer.startsWith("__RESULT__")
          ) {
            fullText += buffer;
            buffer = "";
          }

          if (fullText) {
            setToolStatus(null);
          }

        }

        if (buffer) {
          if (buffer.startsWith("__RESULT__")) {
            try {
              agentResult = JSON.parse(buffer.slice(10)) as AgentResultContract;
            } catch {
              agentResult = null;
            }
          } else if (!buffer.startsWith("__TOOL__") && !buffer.startsWith("__TOOL_DONE__")) {
            fullText += buffer;
          }
        }
        streamFinished = true;
        await revealComplete;
        setToolStatus(null);
        setActiveTools((prev) => prev.map((t) => ({ ...t, status: "complete" as const })));

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
          setActiveTools([]);
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
    setActiveTools([]);
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
          /* Empty state: greeting + chips */
          <div className={`flex min-h-full flex-col items-center justify-start px-4 pb-8 ${variant === "compact" ? "pt-8" : "pt-16 sm:justify-center sm:px-8 sm:py-12"}`}>
            <h1
              className={`${variant === "compact" ? "text-[22px]" : "text-[28px] sm:text-[38px]"} font-semibold text-warm-black tracking-[-0.03em] text-center`}
              suppressHydrationWarning
            >
              {getGreeting()}, {ownerName}
            </h1>
            <p className={`${variant === "compact" ? "text-[12px]" : "text-[14px] sm:text-[15px]"} text-gray-muted mt-3 text-center max-w-xl`}>
              Tell me the business change. I can update the site, draft the customer note, or show what needs your okay before it goes live.
            </p>

            {variant !== "compact" && (
              <div className={`mt-6 w-full max-w-3xl flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 sm:flex sm:flex-row sm:items-center sm:justify-between ${
                pendingNeedsCount > 0 ? "flex" : "hidden"
              }`}>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-warm-black">
                    {pendingNeedsCount > 0
                      ? `${pendingNeedsCount} item${pendingNeedsCount === 1 ? "" : "s"} need your okay`
                      : "No drafts need your okay right now"}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
                    Review larger AI changes in a side panel while keeping the conversation open.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNeedsDrawerOpen(true)}
                  className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-border bg-surface-raised px-3 text-[12px] font-medium text-warm-black transition-colors hover:border-accent/35"
                >
                  <Inbox className="h-4 w-4" strokeWidth={1.5} />
                  Needs You
                </button>
              </div>
            )}

            {/* Suggestion chips - min-h-[48px] ensures 44px+ tap target */}
            <div className={`grid grid-cols-1 gap-3 w-full max-w-3xl ${variant === "compact" ? "mt-6" : "sm:grid-cols-2 mt-8 sm:mt-10"}`}>
              {SUGGESTION_CHIPS.slice(0, variant === "compact" ? 2 : SUGGESTION_CHIPS.length).map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => sendChat(chip.label)}
                  className={`${variant === "compact" ? "min-h-[56px] px-3 py-2.5" : "min-h-[72px] px-4 py-3.5"} ${
                    chip.hideOnMobile ? "hidden sm:block" : ""
                  } rounded-xl bg-glass border border-glass-border hover:bg-gray-bg-hover hover:border-gray-border active:bg-gray-bg transition-all text-left`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <chip.icon className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
                    <span className="text-[13px] font-medium text-warm-black">{chip.label}</span>
                  </div>
                  <span className="text-[12px] text-gray-muted leading-relaxed">
                    {chip.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : messages.length === 0 && isLoading ? (
          <div className="flex min-h-full flex-col items-center justify-start px-4 pb-8 pt-20 sm:justify-center sm:px-8 sm:py-12">
            <div className="ai-thinking-pop rounded-2xl border border-glass-border bg-glass px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <ShiningText text={toolStatus || "AI is thinking..."} className="text-[12px] font-medium" />
            </div>
          </div>
        ) : (
          /* Active conversation */
          <div className={`${variant === "compact" ? "px-3 py-4" : "max-w-3xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-7"} space-y-4`}>
            {/* Update toast */}
            {updateToast && (
              <div
                className={`flex items-start gap-3 px-3 py-3 rounded-lg animate-fade-in-up ${
                  updateToast.status === "published" || updateToast.status === "applied" || updateToast.status === "drafted" || updateToast.status === "queued"
                    ? "bg-success-dim border border-success/20"
                    : "bg-red-500/10 border border-red-500/20"
                }`}
              >
                {updateToast.status === "published" || updateToast.status === "applied" || updateToast.status === "drafted" || updateToast.status === "queued" ? (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" strokeWidth={2} />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" strokeWidth={2} />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[12px] font-medium ${
                      updateToast.status === "published" || updateToast.status === "applied" || updateToast.status === "drafted" || updateToast.status === "queued"
                        ? "text-success"
                        : "text-red-400"
                    }`}
                  >
                    {updateToast.text}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-gray-fg">
                    {updateToast.detail}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-muted">
                    {updateToast.proof}
                  </p>
                  {updateToast.nextAction === "view_site" && (
                    <a
                      href={dashCtx?.siteUrl || "/dashboard/site"}
                      target={dashCtx?.siteUrl ? "_blank" : undefined}
                      rel={dashCtx?.siteUrl ? "noopener noreferrer" : undefined}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-success hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                      View site
                    </a>
                  )}
                  {updateToast.nextAction === "review_queue" && (
                    <Link
                      href={dashCtx?.dashboardHref("/dashboard/review") || "/dashboard/review"}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-success hover:underline"
                    >
                      <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Open Needs You
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setUpdateToast(null)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-muted transition-colors hover:bg-white/10 hover:text-warm-black"
                  aria-label="Dismiss update message"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`${variant === "compact" ? "max-w-[94%]" : "max-w-[88%] sm:max-w-[80%]"} ${message.role === "user" ? "order-2" : ""}`}>
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-accent-dim flex items-center justify-center">
                        <MessageCircle className="w-3 h-3 text-accent" strokeWidth={1.5} />
                      </div>
                      <span className="text-[11px] text-gray-muted">AI</span>
                    </div>
                  )}
                  <div
                    className={`${variant === "compact" ? "px-3 py-2.5 text-[12px]" : "px-4 py-3 text-[13px]"} rounded-2xl leading-relaxed shadow-[0_10px_30px_rgba(0,0,0,0.08)] ${
                      message.role === "user"
                        ? "bg-accent/15 text-warm-black border border-accent/20"
                        : `bg-glass text-warm-black border border-glass-border ${message.content ? "ai-output-pop" : ""}`
                    }`}
                  >
                    {message.content ? (
                      message.role === "assistant" ? (
                        <div className="chat-markdown whitespace-pre-wrap">
                          <ReactMarkdown>{message.content.replace(/\\n/g, "\n")}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )
                    ) : (
                      <span className="flex items-center py-1">
                        <ShiningText text={toolStatus || "AI is thinking..."} className="text-[12px] font-medium" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-subtle mt-1 block px-1">
                    {timeAgo(message.timestamp)}
                  </span>
                </div>
              </div>
            ))}

            {showThinkingBubble && (
              <div className="flex justify-start">
                <div className="max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-accent-dim flex items-center justify-center">
                      <MessageCircle className="w-3 h-3 text-accent" strokeWidth={1.5} />
                    </div>
                    <span className="text-[11px] text-gray-muted">AI</span>
                  </div>
                  <div className="ai-thinking-pop px-4 py-3 rounded-2xl bg-glass border border-glass-border shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                    <ShiningText text={toolStatus || "AI is thinking..."} className="text-[12px] font-medium" />
                  </div>
                </div>
              </div>
            )}

            {/* Active tool calls */}
            {activeTools.some((tool) => tool.result) && (
              <div className="flex justify-start">
                <div className="max-w-[80%] space-y-2">
                  {activeTools.map((tool) => (
                    // Contain a malformed tool payload to its own card — a crash
                    // here used to take down the whole conversation.
                    <SectionErrorBoundary key={tool.id}>
                      <ToolOutput
                        toolName={tool.name}
                        result={tool.result}
                        status={tool.status === "running" ? "pending" : tool.status}
                      />
                    </SectionErrorBoundary>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat input - always at bottom, with safe area for notched devices */}
      <div className={`${variant === "compact" ? "px-3 pb-3 pt-2" : "px-4 sm:px-6 pb-4 sm:pb-6 pt-3"} shrink-0 border-t border-glass-border bg-surface-base/78 backdrop-blur-xl keyboard-safe`}>
        <div className="max-w-3xl mx-auto">
          {readOnly ? (
            <div className="rounded-2xl border border-glass-border bg-glass px-4 py-3 text-center">
              <p className="text-[12px] leading-relaxed text-gray-muted">
                This is a read-only demo.{" "}
                <Link
                  href="/access-request"
                  className="font-medium text-accent hover:underline"
                >
                  Get your own site to chat with your AI
                </Link>
              </p>
            </div>
          ) : (
          <>
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((file) => (
                <span key={file.url} className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] text-amber-200">
                  {file.name}
                </span>
              ))}
            </div>
          )}
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
                ? `Ask AI about ${selectedObjectLabel}`
                : "Tell me what you need..."
            }
            quickActions={INPUT_QUICK_ACTIONS}
            className={variant === "compact" ? "rounded-2xl" : undefined}
          />
          <p className={`${variant === "compact" ? "hidden" : ""} text-[11px] text-gray-subtle text-center mt-2`}>
            Update your site, write content, check analytics
          </p>
          </>
          )}
        </div>
      </div>
      {needsYou && variant !== "compact" && needsDrawerOpen && (
        <>
          <button
            type="button"
            className="absolute inset-0 z-30 bg-[rgba(8,8,10,0.36)]"
            onClick={() => setNeedsDrawerOpen(false)}
            aria-label="Close Needs You"
          />
          <aside
            className="absolute inset-y-0 right-0 z-40 w-full max-w-[520px] border-l border-glass-border bg-surface-base shadow-[0_24px_80px_rgba(0,0,0,0.38)] animate-overlay-enter"
          >
            <div className="flex h-12 items-center justify-between border-b border-glass-border px-4">
              <div className="flex min-w-0 items-center gap-2">
                <Inbox className="h-4 w-4 text-gray-muted" strokeWidth={1.5} />
                <span className="truncate text-[13px] font-medium text-warm-black">Needs You</span>
              </div>
              <button
                type="button"
                onClick={() => setNeedsDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black"
                aria-label="Close Needs You"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
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
