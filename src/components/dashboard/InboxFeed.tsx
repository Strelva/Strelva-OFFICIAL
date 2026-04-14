"use client";

import { useEffect, useState, useCallback } from "react";
import { Bot, Lightbulb, Star, Calendar, UserPlus, Settings, CheckCheck } from "lucide-react";
import { useDashboard } from "./DashboardContext";

interface InboxItem {
  id: string;
  type: "ai-action" | "suggestion" | "review-alert" | "booking" | "subscriber" | "system";
  title: string;
  detail?: string;
  timestamp: string;
  read: boolean;
  section?: string;
  actions?: { label: string; href?: string; chatPrompt?: string }[];
}

const TYPE_CONFIG: Record<string, { icon: typeof Bot; label: string; color: string }> = {
  "ai-action": { icon: Bot, label: "AI", color: "text-sage" },
  suggestion: { icon: Lightbulb, label: "Suggestion", color: "text-amber-500" },
  "review-alert": { icon: Star, label: "Review", color: "text-yellow-500" },
  booking: { icon: Calendar, label: "Booking", color: "text-blue-400" },
  subscriber: { icon: UserPlus, label: "Subscriber", color: "text-emerald-500" },
  system: { icon: Settings, label: "System", color: "text-gray-muted" },
};

const FILTER_TABS = [
  { value: "", label: "All" },
  { value: "ai-action", label: "AI" },
  { value: "suggestion", label: "Tips" },
  { value: "review-alert", label: "Reviews" },
  { value: "booking", label: "Bookings" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function InboxFeed() {
  const { setChatDrawerOpen, setChatPrompt } = useDashboard();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback((typeFilter?: string) => {
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    fetch(`/api/inbox?${params}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { items: [], unreadCount: 0 }))
      .then(({ items: data, unreadCount: count }) => {
        setItems(data);
        setUnreadCount(count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(filter || undefined);
  }, [load, filter]);

  const markAllRead = useCallback(() => {
    fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "mark-all-read" }),
    }).then(() => {
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnreadCount(0);
    }).catch(() => {});
  }, []);

  const handleItemClick = useCallback(
    (item: InboxItem) => {
      // Mark as read
      if (!item.read) {
        fetch("/api/inbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "mark-read", itemId: item.id }),
        }).catch(() => {});
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, read: true } : i))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }

      // If there's a chat prompt action, open chat with it
      const chatAction = item.actions?.find((a) => a.chatPrompt);
      if (chatAction?.chatPrompt) {
        setChatPrompt(chatAction.chatPrompt);
        setChatDrawerOpen(true);
      } else if (item.section) {
        setChatPrompt(`Tell me about my ${item.section} section`);
        setChatDrawerOpen(true);
      }
    },
    [setChatDrawerOpen, setChatPrompt]
  );

  return (
    <div className="rounded-2xl overflow-hidden">
      {/* Header + filters */}
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-medium text-warm-black">
            Activity
          </h3>
          {unreadCount > 0 && (
            <span className="text-[13px] text-gray-muted">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-[13px] text-gray-muted hover:text-warm-black transition-colors"
          >
            Mark read
          </button>
        )}
      </div>

      {/* Filter tabs — inline, no container */}
      <div className="flex gap-1 px-1 mb-3 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setFilter(tab.value);
              setLoading(true);
            }}
            className={`px-3 py-1.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors ${
              filter === tab.value
                ? "bg-white/[0.06] text-warm-black"
                : "text-gray-muted hover:text-warm-black"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="space-y-2 px-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="px-4 py-3 animate-pulse rounded-xl">
                <div className="h-3.5 w-56 bg-white/[0.04] rounded-lg" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-14 px-6">
            <p className="text-[15px] text-gray-muted mb-1">All caught up</p>
            <p className="text-[14px] text-gray-subtle">
              Activity will show up here as you use REB.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 px-1">
            {items.map((item) => {
              const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;
              const Icon = config.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} strokeWidth={1.5} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[14px] ${
                            !item.read ? "text-warm-black" : "text-gray-fg"
                          } truncate`}
                        >
                          {item.title}
                        </span>
                        {!item.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-warm-black shrink-0" />
                        )}
                      </div>
                      {item.detail && (
                        <p className="text-[13px] text-gray-muted mt-0.5 truncate">
                          {item.detail}
                        </p>
                      )}
                      <span className="text-[12px] text-gray-subtle mt-0.5 block">
                        {timeAgo(item.timestamp)}
                      </span>
                    </div>
                    {/* no chevron — less chrome */}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
