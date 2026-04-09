"use client";

import { useRef, useEffect, useState, useCallback, type FormEvent } from "react";
import {
  Send,
  Clock,
  CalendarPlus,
  Mail,
  BarChart3,
  Bot,
  Loader2,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { timeAgo } from "@/lib/utils";
import { useDashboardOptional } from "./DashboardContext";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

const QUICK_PROMPTS = [
  { label: "Change my hours", icon: Clock },
  { label: "Post something new", icon: CalendarPlus },
  { label: "Send an update to customers", icon: Mail },
  { label: "How did this week go?", icon: BarChart3 },
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function ChatPanel({ ownerName = "there" }: { ownerName?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [updateToast, setUpdateToast] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prevLoadingRef = useRef(false);

  // Context integration — pre-fill from content cards + refresh iframe
  const dashCtx = useDashboardOptional();

  // Watch for chatPrompt changes from content card clicks
  useEffect(() => {
    if (dashCtx?.chatPrompt) {
      setInput(dashCtx.chatPrompt);
      dashCtx.setChatPrompt("");
      inputRef.current?.focus();
    }
  }, [dashCtx?.chatPrompt, dashCtx]);

  // Load persisted messages on mount (skip if older than 24h)
  useEffect(() => {
    fetch("/api/chat", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : []))
      .then((saved: ChatMessage[]) => {
        if (Array.isArray(saved) && saved.length > 0) {
          const lastMsg = saved[saved.length - 1];
          const ageMs = Date.now() - (lastMsg.timestamp || 0);
          if (ageMs > 24 * 60 * 60 * 1000) {
            // Stale chat — don't load old messages
            return;
          }
          setMessages(saved);
        }
      })
      .catch(() => {});
  }, []);

  // Persist messages after AI response completes
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && messages.length > 0) {
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(messages),
      }).catch(() => {});
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Verify site update by checking the activity feed for new entries
  const lastActivityRef = useRef<string | null>(null);

  // Capture the latest activity timestamp on mount
  useEffect(() => {
    fetch("/api/activity", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : []))
      .then((items: Array<{ time: string }>) => {
        if (items.length > 0) lastActivityRef.current = items[0].time;
      })
      .catch(() => {});
  }, []);

  const checkForSiteUpdate = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/activity", { credentials: "same-origin" });
      if (!res.ok) return false;
      const items: Array<{ time: string; type: string }> = await res.json();
      if (items.length === 0) return false;
      const latest = items[0];
      if (latest.type === "ai" && latest.time !== lastActivityRef.current) {
        lastActivityRef.current = latest.time;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const sendChat = useCallback(async (text: string) => {
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

        // Parse tool-call status markers
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("__TOOL__")) {
            setToolStatus(line.slice(8));
            continue;
          }
          fullText += line + "\n";
        }
        // Add remaining buffer content that isn't a tool marker
        if (buffer && !buffer.startsWith("__TOOL__")) {
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

      // Process any remaining buffer
      if (buffer) {
        if (buffer.startsWith("__TOOL__")) {
          setToolStatus(null);
        } else {
          fullText += buffer;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullText.trimEnd() } : m
            )
          );
        }
      }
      setToolStatus(null);

      // Verify if the AI actually updated the site via activity feed
      const didUpdate = await checkForSiteUpdate();
      if (didUpdate) {
        setUpdateToast(true);
        dashCtx?.triggerRefresh();
        setTimeout(() => setUpdateToast(false), 5000);
      }
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
    }
  }, [messages, isLoading, checkForSiteUpdate]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    sendChat(input);
  };

  const handleQuickPrompt = (prompt: string) => {
    sendChat(prompt);
  };

  const handleClearChat = useCallback(() => {
    setMessages([]);
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify([]),
    }).catch(() => {});
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-gray-border shrink-0">
        <Avatar type="bot" size="md" />
        <div className="flex-1">
          <h2 className="text-[12px] font-medium text-warm-black">
            AI Assistant
          </h2>
          <p className="text-[11px] text-gray-muted">
            Update your site via chat
          </p>
        </div>
        {!isEmpty && (
          <button
            onClick={handleClearChat}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-subtle hover:text-gray-muted hover:bg-gray-bg transition-colors duration-150"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Active section context pill */}
      {dashCtx?.activeSection && (
        <div className="px-4 py-1.5 border-b border-gray-border bg-gray-bg-alt">
          <span className="text-[11px] text-gray-muted">
            Editing:{" "}
            <span className="font-medium text-sage">
              {SECTION_LABELS[dashCtx.activeSection] || dashCtx.activeSection}
            </span>
          </span>
        </div>
      )}

      {/* Update toast */}
      {updateToast && (
        <div className="mx-3 mt-2 animate-fade-in-up">
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <CheckCircle2 className="w-[14px] h-[14px] text-emerald-500 shrink-0" strokeWidth={1.5} />
            <span className="text-[12px] text-emerald-400">
              Site updated — check the preview
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {isEmpty && (
          <EmptyState
            icon={<Bot className="w-5 h-5 text-sage" strokeWidth={1.5} />}
            title={`Hey ${ownerName}.`}
            description="Your site's looking good. Need anything changed?"
            className="h-full"
            action={
              <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
                {QUICK_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt.label}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickPrompt(prompt.label)}
                    icon={<prompt.icon className="w-[14px] h-[14px] text-gray-muted shrink-0" strokeWidth={1.5} />}
                    className="justify-start bg-surface border border-gray-border text-warm-black hover:bg-gray-bg"
                  >
                    {prompt.label}
                  </Button>
                ))}
              </div>
            }
          />
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`flex items-start gap-2 max-w-[85%] ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <Avatar
                type={message.role === "user" ? "user" : "bot"}
                size="sm"
                className="mt-0.5"
              />
              <div className={message.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={`px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${
                    message.role === "user"
                      ? "bg-sage text-white"
                      : "bg-gray-bg text-warm-black border border-gray-border"
                  }`}
                >
                  {message.content ? (
                    message.role === "assistant" ? (
                      <div className="chat-markdown whitespace-pre-wrap">
                        {/* The stream carries escaped newlines ("\\n") because
                            the agent route JSON-stringifies tool output. Unescape
                            before markdown so line breaks render as line breaks
                            instead of literal backslash-n text. */}
                        <ReactMarkdown>{message.content.replace(/\\n/g, "\n")}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )
                  ) : (
                    <span className="flex items-center gap-1.5 py-1">
                      {toolStatus ? (
                        <>
                          <Loader2 className="w-3 h-3 text-sage animate-spin" strokeWidth={1.5} />
                          <span className="text-[11px] text-sage">{toolStatus}</span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sage animate-typing-dot" />
                          <span className="w-1.5 h-1.5 rounded-full bg-sage animate-typing-dot" style={{ animationDelay: "0.2s" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-sage animate-typing-dot" style={{ animationDelay: "0.4s" }} />
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-gray-subtle mt-0.5 block px-1">
                  {timeAgo(message.timestamp)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick prompts when there are messages */}
      {!isEmpty && !isLoading && (
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {QUICK_PROMPTS.map((prompt) => (
            <Button
              key={prompt.label}
              variant="ghost"
              size="sm"
              onClick={() => handleQuickPrompt(prompt.label)}
              icon={<prompt.icon className="w-3 h-3" strokeWidth={1.5} />}
              className="bg-surface border border-gray-border text-gray-muted hover:text-sage whitespace-nowrap shrink-0"
            >
              {prompt.label}
            </Button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-border">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-surface-inset border border-gray-border rounded-lg px-3 py-1.5 focus-within:border-sage focus-within:shadow-[0_0_0_1px_rgba(143,176,162,0.15)] transition-all duration-150"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me what to update..."
            className="flex-1 bg-transparent text-[12px] text-warm-black placeholder-gray-subtle outline-none h-[44px]"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 ${
              isLoading
                ? "bg-sage"
                : "bg-sage hover:bg-sage-dark disabled:bg-gray-border"
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-[14px] h-[14px] text-white animate-spin" strokeWidth={1.5} />
            ) : (
              <Send className="w-[14px] h-[14px] text-white" strokeWidth={1.5} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
