"use client";

import { useRef, useEffect, useState, useCallback, type FormEvent } from "react";
import {
  Send,
  Clock,
  CalendarPlus,
  FileText,
  BarChart3,
  Bot,
  User,
  Loader2,
  CheckCircle2,
  Globe,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

const QUICK_PROMPTS = [
  { label: "Update my hours", icon: Clock },
  { label: "Add an event", icon: CalendarPlus },
  { label: "Write a blog post", icon: FileText },
  { label: "How's my site?", icon: BarChart3 },
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prevLoadingRef = useRef(false);

  // Load persisted messages on mount
  useEffect(() => {
    fetch("/api/chat", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : []))
      .then((saved: ChatMessage[]) => {
        if (Array.isArray(saved) && saved.length > 0) {
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

  // Detect when AI response mentions an update was made
  const detectSiteUpdate = useCallback((text: string) => {
    const updatePatterns = [
      /updated.*successfully/i,
      /changes.*applied/i,
      /section.*updated/i,
      /i'?ve updated/i,
      /done!.*updated/i,
      /made the change/i,
    ];
    return updatePatterns.some((p) => p.test(text));
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullText } : m
          )
        );
      }

      // Show toast if the AI updated the site
      if (detectSiteUpdate(fullText)) {
        setUpdateToast(true);
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
  }, [messages, isLoading, detectSiteUpdate]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    sendChat(input);
  };

  const handleQuickPrompt = (prompt: string) => {
    sendChat(prompt);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#262626]">
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">
            Chat with your AI assistant
          </h2>
          <p className="text-xs text-zinc-500">
            Ask me to update your site, add events, change hours, anything.
          </p>
        </div>
      </div>

      {/* Update toast */}
      {updateToast && (
        <div className="mx-4 mt-3 animate-fade-in-up">
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-600/10 border border-emerald-600/20 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-300 flex-1">
              Your site has been updated
            </span>
            <Link
              href="/dashboard/site"
              className="flex items-center gap-1 text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <Globe className="w-3 h-3" />
              View changes
            </Link>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-lg bg-violet-600/10 flex items-center justify-center mb-4 animate-pulse-gentle">
              <Bot className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Hey {ownerName}! What can I help with?
            </h3>
            <p className="text-sm text-zinc-400 max-w-sm mb-8">
              I can update your website content, add events, change hours, write
              copy, and more. Just tell me what you need.
            </p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  onClick={() => handleQuickPrompt(prompt.label)}
                  className="flex items-center gap-2 px-4 py-3 rounded-md bg-[#141414] border border-[#262626] text-sm text-zinc-300 hover:bg-[#1c1c1c] hover:text-white hover:border-[#333] transition-colors duration-150 text-left"
                >
                  <prompt.icon className="w-4 h-4 text-violet-400 shrink-0" />
                  <span className="font-mono text-xs">{prompt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`flex items-start gap-3 max-w-[85%] ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  message.role === "user" ? "bg-zinc-700" : "bg-violet-600"
                }`}
              >
                {message.role === "user" ? (
                  <User className="w-3.5 h-3.5 text-zinc-300" />
                ) : (
                  <Bot className="w-3.5 h-3.5 text-white" />
                )}
              </div>
              <div className={message.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-violet-600 text-white"
                      : "bg-[#141414] text-zinc-200 border border-[#262626]"
                  }`}
                >
                  {message.content ? (
                    message.role === "assistant" ? (
                      <div className="chat-markdown">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )
                  ) : (
                    <span className="flex items-center gap-2 py-0.5">
                      <span className="w-2 h-2 rounded-full bg-violet-500 animate-typing-dot" />
                      <span className="text-xs text-zinc-500">Thinking</span>
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-zinc-600 mt-1 block px-1">
                  {timeAgo(message.timestamp)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick prompts when there are messages */}
      {!isEmpty && !isLoading && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-hide">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              onClick={() => handleQuickPrompt(prompt.label)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#141414] border border-[#262626] text-xs font-mono text-zinc-400 hover:bg-[#1c1c1c] hover:text-zinc-200 transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              <prompt.icon className="w-3 h-3" />
              {prompt.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-[#262626]">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-[#141414] border border-[#262626] rounded-lg px-4 py-2 focus-within:border-violet-600/50 transition-colors duration-150"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me what to update..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none min-h-[44px]"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all duration-150 shrink-0 ${
              isLoading
                ? "bg-violet-600 shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                : "bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600"
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
