"use client";

import { useRef, useEffect, useState, useCallback, type FormEvent } from "react";
import {
  ArrowUp,
  Clock,
  CalendarPlus,
  Mail,
  BarChart3,
  Loader2,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { timeAgo } from "@/lib/utils";
import { useDashboardOptional } from "./DashboardContext";
import { ToolOutput } from "./ToolOutput";

const SUGGESTION_CHIPS = [
  { label: "Update my hours", icon: Clock, description: "Change business hours and holiday schedules" },
  { label: "Write a blog post", icon: CalendarPlus, description: "Draft a new post for your website blog" },
  { label: "Send an update to customers", icon: Mail, description: "Email your subscribers about news" },
  { label: "How's my site doing?", icon: BarChart3, description: "Check weekly traffic and booking analytics" },
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

interface ChatPanelProps {
  threadId?: string;
  ownerName: string;
  onThreadCreated?: (id: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function ChatPanel({ threadId, ownerName, onThreadCreated }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [updateToast, setUpdateToast] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentThreadRef = useRef<string | undefined>(threadId);

  const dashCtx = useDashboardOptional();

  // Load thread messages when threadId changes
  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      currentThreadRef.current = undefined;
      return;
    }

    currentThreadRef.current = threadId;

    fetch(`/api/threads/${threadId}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((thread) => {
        if (thread && thread.messages && currentThreadRef.current === threadId) {
          setMessages(
            thread.messages.map((m: { id: string; role: string; content: string; timestamp: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.timestamp).getTime(),
            }))
          );
        }
      })
      .catch(() => {});
  }, [threadId]);

  // Watch for chatPrompt changes from content card clicks
  useEffect(() => {
    if (dashCtx?.chatPrompt) {
      setInput(dashCtx.chatPrompt);
      dashCtx.setChatPrompt("");
      inputRef.current?.focus();
    }
  }, [dashCtx?.chatPrompt, dashCtx]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendChat = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const allMessages = [...messages, userMsg];
      setMessages(allMessages);
      setInput("");
      setIsLoading(true);
      setActiveTools([]);

      // If no threadId, create a new thread first
      let activeThreadId = threadId;
      if (!activeThreadId) {
        try {
          const createRes = await fetch("/api/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ title: text.slice(0, 50) }),
          });
          if (createRes.ok) {
            const newThread = await createRes.json();
            activeThreadId = newThread.id as string;
            currentThreadRef.current = activeThreadId;
            onThreadCreated?.(activeThreadId);
          }
        } catch {
          // Continue without thread persistence
        }
      }

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            messages: allMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            activeSection: dashCtx?.activeSection || null,
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

        const assistantId = (Date.now() + 1).toString();
        const assistantTs = Date.now();
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", timestamp: assistantTs },
        ]);

        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

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
              const toolId = `tool_${Date.now()}`;
              setActiveTools((prev) => [
                ...prev,
                { id: toolId, name: toolInfo, status: "running" as const },
              ]);
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

          if (buffer && !buffer.startsWith("__TOOL__") && !buffer.startsWith("__TOOL_DONE__")) {
            fullText += buffer;
            buffer = "";
          }

          if (fullText) {
            setToolStatus(null);
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullText.trimEnd() } : m
            )
          );
        }

        if (buffer) {
          if (!buffer.startsWith("__TOOL__") && !buffer.startsWith("__TOOL_DONE__")) {
            fullText += buffer;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullText.trimEnd() } : m
              )
            );
          }
        }
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
          fetch(`/api/threads/${activeThreadId}`, {
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
        }

        // Check for site update
        try {
          const actRes = await fetch("/api/activity", { credentials: "same-origin" });
          if (actRes.ok) {
            const items = await actRes.json();
            if (items.length > 0 && items[0].type === "ai") {
              setUpdateToast(true);
              dashCtx?.triggerRefresh();
              setTimeout(() => setUpdateToast(false), 5000);
            }
          }
        } catch {}
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: "Sorry, I couldn't connect. Please try again.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
        setActiveTools([]);
      }
    },
    [messages, isLoading, threadId, onThreadCreated, dashCtx]
  );

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    sendChat(input);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Scrollable content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* Empty state: greeting + chips */
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <h1
              className="text-[28px] font-medium text-warm-black tracking-[-0.02em]"
              suppressHydrationWarning
            >
              {getGreeting()}, {ownerName}
            </h1>
            <p className="text-[14px] text-gray-muted mt-1.5">
              What can I help you with today?
            </p>

            {/* Suggestion chips */}
            <div className="flex flex-col sm:flex-row gap-3 mt-10 w-full max-w-2xl">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => sendChat(chip.label)}
                  className="flex-1 rounded-xl bg-surface border border-gray-border px-4 py-3 hover:bg-gray-bg-hover hover:border-gray-subtle transition-all text-left"
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
        ) : (
          /* Active conversation */
          <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-4">
            {/* Update toast */}
            {updateToast && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-success-dim border border-success/20 rounded-lg animate-fade-in-up">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={2} />
                <span className="text-[12px] font-medium text-success">
                  Done — your site is updated
                </span>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] ${message.role === "user" ? "order-2" : ""}`}>
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-accent-dim flex items-center justify-center">
                        <MessageCircle className="w-3 h-3 text-accent" strokeWidth={1.5} />
                      </div>
                      <span className="text-[11px] text-gray-muted">AI</span>
                    </div>
                  )}
                  <div
                    className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                      message.role === "user"
                        ? "bg-accent/15 text-warm-black border border-accent/20"
                        : "bg-surface text-warm-black border border-gray-border"
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
                      <span className="flex items-center gap-1.5 py-1">
                        {toolStatus ? (
                          <>
                            <Loader2
                              className="w-3 h-3 text-accent animate-spin"
                              strokeWidth={1.5}
                            />
                            <span className="text-[11px] text-accent">{toolStatus}</span>
                          </>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-typing-dot" />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-accent animate-typing-dot"
                              style={{ animationDelay: "0.2s" }}
                            />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-accent animate-typing-dot"
                              style={{ animationDelay: "0.4s" }}
                            />
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-subtle mt-1 block px-1">
                    {timeAgo(message.timestamp)}
                  </span>
                </div>
              </div>
            ))}

            {/* Active tool calls */}
            {activeTools.length > 0 && (
              <div className="flex justify-start">
                <div className="max-w-[80%] space-y-2">
                  {activeTools.map((tool) => (
                    <ToolOutput
                      key={tool.id}
                      toolName={tool.name}
                      result={tool.result}
                      status={tool.status === "running" ? "pending" : tool.status}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat input - always at bottom */}
      <div className="shrink-0 px-6 pb-6 pt-3 border-t border-gray-border bg-surface">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 bg-surface-inset border border-gray-border rounded-2xl px-4 py-2 focus-within:border-accent/30 transition-all"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me what you need..."
              className="flex-1 bg-transparent text-[13px] text-warm-black placeholder-gray-subtle outline-none h-[40px]"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-[34px] h-[34px] rounded-xl bg-accent hover:bg-accent/80 disabled:bg-gray-border flex items-center justify-center transition-all shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" strokeWidth={1.5} />
              ) : (
                <ArrowUp className="w-4 h-4 text-white" strokeWidth={2} />
              )}
            </button>
          </form>
          <p className="text-[11px] text-gray-subtle text-center mt-2">
            Update your site, write content, check analytics
          </p>
        </div>
      </div>
    </div>
  );
}
