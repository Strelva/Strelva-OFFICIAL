"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { ChatPanel } from "./ChatPanel";

interface ChatDrawerProps {
  ownerName: string;
}

export function ChatDrawer({ ownerName }: ChatDrawerProps) {
  const { chatDrawerOpen, setChatDrawerOpen } = useDashboard();
  const pathname = usePathname();

  // Hide floating button on /dashboard/content — chat is already embedded in the right panel there
  const hideFloatingButton = pathname === "/dashboard/content";

  const close = useCallback(() => setChatDrawerOpen(false), [setChatDrawerOpen]);

  // Escape key to close
  useEffect(() => {
    if (!chatDrawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [chatDrawerOpen, close]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!chatDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatDrawerOpen]);

  return (
    <>
      {/* Floating action button — hidden on content page where chat is inline */}
      {!chatDrawerOpen && !hideFloatingButton && (
        <button
          onClick={() => setChatDrawerOpen(true)}
          className="fixed z-40 w-11 h-11 rounded-full bg-sage text-white shadow-md hover:bg-sage-dark hover:scale-105 transition-all duration-200 flex items-center justify-center bottom-[72px] right-4 md:bottom-6 md:right-6"
          title="Open AI Chat"
          aria-label="Open chat"
        >
          <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
        </button>
      )}

      {/* Backdrop */}
      {chatDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-200"
          onClick={close}
          aria-hidden
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-[380px] bg-surface border-l border-gray-border shadow-[-4px_0_12px_rgba(0,0,0,0.3)] flex flex-col transition-transform duration-300 ease-out ${
          chatDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-gray-border shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-sage" strokeWidth={1.5} />
            <span className="text-[12px] font-medium text-warm-black">AI Chat</span>
          </div>
          <button
            onClick={close}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors duration-150"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          <ChatPanel ownerName={ownerName} />
        </div>
      </div>
    </>
  );
}
