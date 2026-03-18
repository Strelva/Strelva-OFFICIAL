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
} from "lucide-react";

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
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendChat = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
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
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
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
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Sorry, I couldn't connect. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    sendChat(input);
  };

  const handleQuickPrompt = (prompt: string) => {
    sendChat(prompt);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
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

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Hey Chelsea! What can I help with?
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
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 transition-colors text-left"
                >
                  <prompt.icon className="w-4 h-4 text-violet-400 shrink-0" />
                  {prompt.label}
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
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-900 text-zinc-200 border border-zinc-800"
                }`}
              >
                <p className="whitespace-pre-wrap">
                  {message.content || (
                    <span className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce [animation-delay:300ms]" />
                    </span>
                  )}
                </p>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors whitespace-nowrap shrink-0"
            >
              <prompt.icon className="w-3 h-3" />
              {prompt.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-zinc-800">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 focus-within:border-violet-600/50 transition-colors"
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
            className="w-9 h-9 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 flex items-center justify-center transition-colors shrink-0"
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
