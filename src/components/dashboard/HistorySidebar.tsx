"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  FileText,
  MessageSquare,
  Link2,
  Settings,
  X,
  Search,
  Plus,
  LogOut,
} from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
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
  pendingCount?: number;
}

const NAV_ITEMS = [
  { href: "/dashboard/queue", label: "Queue", icon: Inbox },
  { href: "/dashboard/brief", label: "Brief", icon: FileText },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/connections", label: "Connections", icon: Link2 },
];

export function HistorySidebar({
  threads,
  activeThreadId,
  onNewChat,
  onSelectThread,
  ownerName,
  isOpen = true,
  onClose,
  pendingCount = 0,
}: HistorySidebarProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const isOnChatPage = pathname?.startsWith("/dashboard/chat");

  const filteredThreads = searchQuery
    ? threads.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : threads;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Mobile close button */}
      <div className="flex items-center justify-between p-3 lg:hidden">
        <span className="text-[13px] font-medium text-warm-black">Menu</span>
        <button
          onClick={onClose}
          className="w-11 h-11 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Main navigation */}
      <nav className="px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/") || (item.href === "/dashboard/chat" && pathname?.startsWith("/dashboard/chat"));
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard/queue" && pendingCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 min-h-[44px] text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-gray-bg-hover text-warm-black"
                  : "text-gray-muted hover:text-warm-black hover:bg-gray-bg"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-accent-dim text-accent rounded-full">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Chat history section - only show when on chat page */}
      {isOnChatPage && (
        <div className="flex-1 flex flex-col min-h-0 border-t border-glass-border mt-2">
          <div className="px-3 py-3 space-y-2">
            {/* New chat button */}
            <button
              onClick={onNewChat}
              className="flex items-center gap-2 w-full rounded-lg bg-surface-raised border border-glass-border px-3 py-2.5 min-h-[44px] text-gray-muted hover:text-warm-black hover:bg-gray-bg-hover transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-[12px]">New chat</span>
            </button>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full bg-surface-inset border border-gray-border rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-warm-black placeholder-gray-subtle outline-none focus:border-sage/50 transition-colors"
              />
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-center">
                <p className="text-[11px] text-gray-muted">
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
                      className={`w-full text-left rounded-lg px-2.5 py-2.5 min-h-[44px] transition-colors ${
                        isActive ? "bg-gray-bg-hover" : "hover:bg-gray-bg"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-[12px] font-medium truncate ${
                            isActive ? "text-warm-black" : "text-gray-fg"
                          }`}
                        >
                          {thread.title}
                        </span>
                        <span className="text-[9px] text-gray-muted shrink-0 mt-0.5">
                          {timeAgo(thread.updatedAt)}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-muted truncate mt-0.5">
                        {thread.preview}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spacer when not on chat page */}
      {!isOnChatPage && <div className="flex-1" />}

      {/* User footer with settings */}
      <div className="p-3 border-t border-glass-border mt-auto">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-accent-dim flex items-center justify-center shrink-0">
            <span className="text-[11px] font-semibold text-accent">
              {ownerName[0]?.toUpperCase() || "U"}
            </span>
          </div>
          <span className="text-[12px] text-warm-black flex-1 truncate">
            {ownerName}
          </span>
          <Link
            href="/dashboard/settings"
            onClick={onClose}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
              pathname?.startsWith("/dashboard/settings")
                ? "text-warm-black bg-gray-bg"
                : "text-gray-muted hover:text-warm-black hover:bg-gray-bg"
            }`}
            title="Settings"
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          <SignOutButton>
            <button
              className="w-9 h-9 rounded-md flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] h-full bg-surface-base shrink-0 border-r border-glass-border">
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
