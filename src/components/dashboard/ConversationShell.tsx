"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { HistorySidebar, type Thread } from "./HistorySidebar";

interface ConversationShellProps {
  children: ReactNode;
  threads: Thread[];
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  ownerName: string;
}

export function ConversationShell({
  children,
  threads,
  activeThreadId,
  onNewChat,
  onSelectThread,
  ownerName,
}: ConversationShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-surface-base" data-dashboard>
      {/* History sidebar */}
      <HistorySidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onNewChat={onNewChat}
        onSelectThread={onSelectThread}
        ownerName={ownerName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 bg-surface">
        {/* Mobile header with menu toggle */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-12 border-b border-gray-border bg-surface shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <span className="text-[14px] font-medium text-warm-black">REB</span>
        </header>

        {/* Content */}
        <div className="flex-1 min-h-0">{children}</div>
      </main>
    </div>
  );
}
