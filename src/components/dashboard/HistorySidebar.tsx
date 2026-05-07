"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Link2,
  MessageCircle,
  Settings,
  X,
  LogOut,
  Sparkles,
  LayoutPanelLeft,
} from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";

export interface Thread {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
}

interface HistorySidebarProps {
  ownerName: string;
  isOpen?: boolean;
  onClose?: () => void;
  pendingCount?: number;
  valueProof?: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "What's working", icon: FileText },
  { href: "/dashboard/chat", label: "Ask AI", icon: MessageCircle },
  { href: "/dashboard/review", label: "Needs approval", icon: Inbox },
  { href: "/dashboard/site", label: "My site", icon: LayoutPanelLeft },
  { href: "/dashboard/assets", label: "Assets", icon: ImageIcon },
  { href: "/dashboard/sources", label: "Connected accounts", icon: Link2 },
  { href: "/dashboard/ownership", label: "Ownership Center", icon: KeyRound },
];

export function HistorySidebar({
  ownerName,
  isOpen = true,
  onClose,
  pendingCount = 0,
  valueProof,
}: HistorySidebarProps) {
  const pathname = usePathname();

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Mobile close button */}
      <div className="flex items-center justify-between p-3 lg:hidden border-b border-glass-border">
        <span className="text-[13px] font-medium text-warm-black">Scaffold Web</span>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="hidden lg:block px-3 pt-4 pb-3">
        <div className="rounded-xl border border-glass-border bg-glass px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-dim text-accent flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-warm-black truncate">{ownerName}</p>
              <p className="text-[10px] text-gray-muted truncate">{valueProof || "AI site management"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main navigation */}
      <nav className="px-2 py-2 space-y-0.5" aria-label="Dashboard">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname?.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard/review" && pendingCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`group flex items-center gap-3 w-full rounded-lg px-3 py-2.5 min-h-[42px] text-[13px] font-medium transition-all ${
                isActive
                  ? "bg-gray-bg-hover text-warm-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]"
                  : "text-gray-muted hover:text-warm-black hover:bg-gray-bg"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* User footer with settings */}
      <div className="p-3 border-t border-glass-border mt-auto">
        {valueProof && (
          <div className="lg:hidden mb-2 rounded-lg border border-glass-border bg-surface-raised px-3 py-2">
            <p className="text-[12px] font-medium text-warm-black mt-0.5">
              {valueProof}
            </p>
          </div>
        )}
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
      <aside className="hidden lg:flex flex-col w-[260px] h-full bg-surface-base/95 shrink-0 border-r border-glass-border">
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
          <aside className="absolute left-0 top-0 bottom-0 w-[296px] bg-surface-base animate-panel-left border-r border-glass-border">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
