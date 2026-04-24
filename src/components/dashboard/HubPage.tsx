"use client";

import { useState, useRef, useCallback, type FormEvent } from "react";
import {
  Timer,
  FileText,
  TrendingUp,
  ArrowUp,
  Loader2,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useDashboard } from "./DashboardContext";
import { timeAgo } from "@/lib/utils";

const CTA_VOCAB: Record<string, { metric: string; action: string }> = {
  wellness: { metric: "Booking clicks", action: "clicked Book Now" },
  "food-brand": { metric: "Shop clicks", action: "clicked Shop Now" },
  restaurant: { metric: "Reservation clicks", action: "clicked Reserve" },
  trades: { metric: "Quote requests", action: "requested a quote" },
  professional: { metric: "Contact clicks", action: "clicked Contact" },
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const SUGGESTION_CHIPS = [
  { label: "Update my hours", description: "Change business hours and holiday schedules", icon: Timer },
  { label: "Write a blog post", description: "Draft a new post for your website blog", icon: FileText },
  { label: "How's my site doing?", description: "Check weekly traffic and booking analytics", icon: TrendingUp },
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface HubPageProps {
  ownerName: string;
  siteName: string;
  pageViews: { total: number; today: number; thisWeek: number };
  bookingClicks: { total: number; today: number; thisWeek: number };
  siteScore: { score: number; items: { label: string; done: boolean }[] };
  suggestions: string[];
  sectionData: Record<string, unknown>;
  isInvited?: boolean;
  recentActivity?: Array<{ text: string; time: string }>;
}

export function HubPage({
  ownerName,
  pageViews,
  bookingClicks,
  siteScore,
}: HubPageProps) {
  const { template, triggerRefresh } = useDashboard();
  const vocab = CTA_VOCAB[template] || CTA_VOCAB.wellness;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [updateToast, setUpdateToast] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [connectionFilter, setConnectionFilter] = useState("");
  const [selectedConnectionIdx, setSelectedConnectionIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const CONNECTIONS = [
    { name: "Google Analytics", tag: "analytics", status: "connected" as const },
    { name: "Mailchimp", tag: "email", status: "connected" as const },
    { name: "Instagram", tag: "social", status: "available" as const },
    { name: "Google Business", tag: "reviews", status: "available" as const },
    { name: "Calendly", tag: "booking", status: "available" as const },
    { name: "Stripe", tag: "payments", status: "available" as const },
  ];

  const filteredConnections = CONNECTIONS.filter((c) =>
    c.name.toLowerCase().includes(connectionFilter.toLowerCase()) ||
    c.tag.toLowerCase().includes(connectionFilter.toLowerCase())
  );

  const hasConversation = messages.length > 0;

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
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `Sorry, something went wrong: ${err.error || res.statusText}`,
          timestamp: Date.now(),
        }]);
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setIsLoading(false); return; }

      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: Date.now() }]);

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
          if (line.startsWith("__TOOL__")) { setToolStatus(line.slice(8)); continue; }
          fullText += line + "\n";
        }
        if (buffer && !buffer.startsWith("__TOOL__")) { fullText += buffer; buffer = ""; }
        if (fullText) setToolStatus(null);
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullText.trimEnd() } : m));
      }
      if (buffer) {
        if (!buffer.startsWith("__TOOL__")) {
          fullText += buffer;
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullText.trimEnd() } : m));
        }
      }
      setToolStatus(null);

      // Check for site update
      try {
        const actRes = await fetch("/api/activity", { credentials: "same-origin" });
        if (actRes.ok) {
          const items = await actRes.json();
          if (items.length > 0 && items[0].type === "ai") {
            setUpdateToast(true);
            triggerRefresh();
            setTimeout(() => setUpdateToast(false), 5000);
          }
        }
      } catch {}
    } catch {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "Sorry, I couldn't connect. Please try again.",
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
    }
  }, [messages, isLoading, triggerRefresh]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    sendChat(input);
  };

  // Proof strip values
  const siteHealthy = siteScore.score >= 70;

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasConversation ? (
          /* ─── Empty state: greeting + chips ─── */
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            {/* Greeting icon */}
            <div className="w-14 h-14 rounded-[18px] bg-surface-raised border border-glass-border flex items-center justify-center mb-6 shadow-[0_4px_24px_rgba(91,141,239,0.07)]">
              <MessageCircle className="w-[26px] h-[26px] text-accent" strokeWidth={1.5} />
            </div>

            <h1 className="text-[26px] font-medium text-warm-black tracking-[-0.02em]" suppressHydrationWarning>
              {getGreeting()}, {ownerName}
            </h1>
            <p className="text-[14px] text-gray-muted mt-1.5">
              What can I help you with today?
            </p>

            {/* Proof strip */}
            <div className="flex items-center gap-3 mt-6 text-[12px] text-gray-muted">
              <span className="font-medium text-warm-black">{pageViews.thisWeek}</span>
              <span>visitors this week</span>
              <span className="text-gray-faint">·</span>
              <span className="font-medium text-warm-black">{bookingClicks.thisWeek}</span>
              <span>{vocab.action.replace("clicked ", "").toLowerCase()} clicks</span>
              <span className="text-gray-faint">·</span>
              <span className={siteHealthy ? "text-success" : "text-gray-muted"}>
                {siteHealthy ? "✓ site healthy" : `${siteScore.score}% complete`}
              </span>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-col sm:flex-row gap-3 mt-10 w-full max-w-2xl">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => sendChat(chip.label)}
                  className="flex-1 flex items-start gap-3 rounded-2xl bg-surface border border-gray-border p-4 hover:bg-gray-bg-hover hover:border-gray-subtle transition-all text-left group"
                >
                  <chip.icon className="w-[18px] h-[18px] text-accent shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <span className="text-[13px] font-medium text-warm-black block">{chip.label}</span>
                    <span className="text-[12px] text-gray-muted mt-0.5 block leading-relaxed">{chip.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ─── Active conversation ─── */
          <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-4">
            {/* Update toast */}
            {updateToast && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-success-dim border border-success/20 rounded-lg animate-fade-in-up">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={2} />
                <span className="text-[12px] font-medium text-success">Done — your site is updated</span>
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
                            <Loader2 className="w-3 h-3 text-accent animate-spin" strokeWidth={1.5} />
                            <span className="text-[11px] text-accent">{toolStatus}</span>
                          </>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-typing-dot" />
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-typing-dot" style={{ animationDelay: "0.2s" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-typing-dot" style={{ animationDelay: "0.4s" }} />
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
          </div>
        )}
      </div>

      {/* Chat input — always at bottom */}
      <div className="shrink-0 px-6 pb-6 pt-3">
        <div className="max-w-3xl mx-auto relative">
          {/* @ Connections dropdown */}
          {showConnections && filteredConnections.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 w-[260px] rounded-lg bg-surface-raised border border-gray-border py-1 z-20 shadow-lg">
              <div className="px-3 py-1.5 text-[10px] font-mono tracking-wider uppercase text-gray-faint">
                Connections
              </div>
              {filteredConnections.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  className={`flex items-center gap-2.5 w-full px-3 py-2 mx-0 text-left transition-colors ${
                    i === selectedConnectionIdx
                      ? "bg-accent/10"
                      : "hover:bg-gray-bg"
                  }`}
                  onClick={() => {
                    const atIdx = input.lastIndexOf("@");
                    const before = atIdx >= 0 ? input.slice(0, atIdx) : input;
                    setInput(`${before}@${c.name} `);
                    setShowConnections(false);
                    setConnectionFilter("");
                    inputRef.current?.focus();
                  }}
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      c.status === "connected"
                        ? "bg-green-400"
                        : "bg-accent"
                    }`}
                  />
                  <span className="flex-1 text-[13px] text-warm-white">
                    {c.name}
                  </span>
                  <span className="text-[10px] font-mono text-gray-faint">
                    {c.tag}
                  </span>
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 bg-surface-inset border border-gray-border rounded-2xl px-4 py-2 focus-within:border-accent/30 transition-all"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);

                // Detect @ trigger
                const atIdx = val.lastIndexOf("@");
                if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === " ")) {
                  const query = val.slice(atIdx + 1);
                  // Only show if no space after the query (still typing the mention)
                  if (!query.includes(" ")) {
                    setShowConnections(true);
                    setConnectionFilter(query);
                    setSelectedConnectionIdx(0);
                    return;
                  }
                }
                setShowConnections(false);
                setConnectionFilter("");
              }}
              onKeyDown={(e) => {
                if (!showConnections) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedConnectionIdx((i) =>
                    Math.min(i + 1, filteredConnections.length - 1)
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedConnectionIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && filteredConnections.length > 0) {
                  e.preventDefault();
                  const c = filteredConnections[selectedConnectionIdx];
                  const atIdx = input.lastIndexOf("@");
                  const before = atIdx >= 0 ? input.slice(0, atIdx) : input;
                  setInput(`${before}@${c.name} `);
                  setShowConnections(false);
                  setConnectionFilter("");
                } else if (e.key === "Escape") {
                  setShowConnections(false);
                }
              }}
              placeholder="Tell me what you need... (type @ for connections)"
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
            Update your site, write content, check analytics — type @ to use connections
          </p>
        </div>
      </div>
    </div>
  );
}
