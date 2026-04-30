"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Settings, X, MessageSquare } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export interface Thread {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
}

interface HistorySidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  ownerName: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function HistorySidebar({
  threads,
  activeThreadId,
  onNewChat,
  onSelectThread,
  ownerName,
  isOpen = true,
  onClose,
}: HistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredThreads = searchQuery
    ? threads.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : threads;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header with new chat */}
      <div className="p-3 space-y-3">
        {/* Mobile close button */}
        <div className="flex items-center justify-between lg:hidden">
          <span className="text-[13px] font-medium text-warm-black">Chats</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* New chat button */}
        <button
          onClick={onNewChat}
          className="flex items-center gap-2 w-full rounded-xl bg-surface-raised border border-glass-border px-3.5 py-2.5 text-gray-muted hover:text-warm-black hover:bg-gray-bg-hover transition-colors"
        >
          <Plus className="w-[15px] h-[15px]" strokeWidth={1.5} />
          <span className="text-[13px]">New chat</span>
        </button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full bg-surface-inset border border-gray-border rounded-lg pl-9 pr-3 py-2 text-[12px] text-warm-black placeholder-gray-subtle outline-none focus:border-sage/50 transition-colors"
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <MessageSquare className="w-5 h-5 text-gray-faint mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-gray-muted">
              {searchQuery ? "No matching chats" : "No conversations yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredThreads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <button
                  key={thread.id}
                  onClick={() => onSelectThread(thread.id)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                    isActive
                      ? "bg-gray-bg-hover"
                      : "hover:bg-gray-bg"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-[13px] font-medium truncate ${
                        isActive ? "text-warm-black" : "text-gray-fg"
                      }`}
                    >
                      {thread.title}
                    </span>
                    <span className="text-[10px] text-gray-muted shrink-0 mt-0.5">
                      {timeAgo(thread.updatedAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-muted truncate mt-0.5">
                    {thread.preview}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User footer */}
      <div className="p-3 border-t border-glass-border">
        <div className="flex items-center gap-2.5 rounded-xl bg-glass px-2 py-2.5">
          <div className="w-[30px] h-[30px] rounded-full bg-accent-dim flex items-center justify-center shrink-0">
            <span className="text-[12px] font-semibold text-accent">
              {ownerName[0]?.toUpperCase() || "U"}
            </span>
          </div>
          <span className="text-[13px] text-warm-black flex-1 truncate">
            {ownerName}
          </span>
          <Link
            href="/dashboard/settings"
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[280px] h-full bg-surface-base shrink-0 border-r border-glass-border">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Sidebar panel */}
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-surface-base animate-panel-left">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
