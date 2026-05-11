"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Inbox,
  Link2,
  MessageCircle,
  Settings,
  Search,
  X,
  LogOut,
  LayoutPanelLeft,
  Plus,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";

export interface Thread {
  id: string;
  title: string;
  preview: string;
  updatedAt: number | string;
}

interface HistorySidebarProps {
  ownerName: string;
  isOpen?: boolean;
  onClose?: () => void;
  pendingCount?: number;
  valueProof?: string;
}

const NAV_ITEMS = [
  { href: "/dashboard/chat", label: "Ask AI", icon: MessageCircle },
  { href: "/dashboard/review", label: "Approvals", icon: Inbox },
  { href: "/dashboard/site", label: "Site", icon: LayoutPanelLeft },
  { href: "/dashboard/sources", label: "Connections", icon: Link2 },
];

const NAV_GROUPS = [
  {
    label: "Manage",
    items: NAV_ITEMS.slice(0, 2),
  },
  {
    label: "Site",
    items: NAV_ITEMS.slice(2, 4),
  },
];

export function HistorySidebar({
  ownerName,
  isOpen = true,
  onClose,
  pendingCount = 0,
  valueProof,
}: HistorySidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const [threads, setThreads] = useState<Thread[]>([]);
  const activeThread = searchParams.get("thread");
  const effectivePathname =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname;

  useEffect(() => {
    fetch(dashboardHref("/api/threads"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setThreads(
          list.slice(0, 6).map((thread: Thread & { messages?: Array<{ content?: string }> }) => ({
            ...thread,
            preview: thread.preview || thread.messages?.at(-1)?.content || "No messages yet",
          })),
        );
      })
      .catch(() => setThreads([]));
  }, [dashboardHref, pathname]);

  const sidebarContent = (variant: "desktop" | "mobile") => (
    <aside
      className={`flex h-full w-full max-w-full flex-col justify-between overflow-auto bg-surface-base ${
        variant === "desktop"
          ? "rounded-xl border border-glass-border shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
          : ""
      }`}
    >
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

      <div className="flex items-center justify-between gap-5 px-4 pt-4 lg:pl-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-border bg-surface-raised text-[11px] font-semibold text-warm-black">
            {(ownerName || "S").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-tight text-warm-black">{ownerName}</p>
            <p className="truncate text-[11px] leading-tight text-gray-muted">{valueProof || "AI site management"}</p>
          </div>
        </div>
        <Link
          href={dashboardHref("/dashboard/chat")}
          prefetch={false}
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black"
          title="Search"
          aria-label="Search"
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="mt-6" aria-label="Dashboard">
        <ul>
          {NAV_GROUPS.map((group) => (
            <li key={group.label}>
              <div className="px-5 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-muted">{group.label}</p>
              </div>
              <ul className="px-3 pb-5">
                {group.items.map((item) => {
                  const isActive = item.href === "/dashboard"
                    ? effectivePathname === "/dashboard"
                    : effectivePathname?.startsWith(item.href);
                  const Icon = item.icon;
                  const showBadge = item.href === "/dashboard/review" && pendingCount > 0;

                  return (
                    <li key={item.href} className="py-0.5">
                      <Link
                        href={dashboardHref(item.href)}
                        prefetch={false}
                        onClick={onClose}
                        className={`group flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                          isActive
                            ? "bg-gray-bg-hover text-warm-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]"
                            : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {showBadge && (
                          <span className="rounded-full bg-accent-dim px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                            {pendingCount > 9 ? "9+" : pendingCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {group.label === "Manage" && (
                  <li className="mt-2 rounded-lg border border-gray-border bg-surface-raised/45 p-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-faint">
                        AI history
                      </span>
                      <Link
                        href={dashboardHref("/dashboard/chat")}
                        prefetch={false}
                        onClick={onClose}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black"
                        aria-label="Start a new AI chat"
                        title="New chat"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                      </Link>
                    </div>
                    {threads.length ? (
                      <div className="space-y-0.5">
                        {threads.map((thread) => {
                          const isThreadActive = activeThread === thread.id;
                          return (
                            <Link
                              key={thread.id}
                              href={dashboardHref(`/dashboard/chat?thread=${thread.id}`)}
                              prefetch={false}
                              onClick={onClose}
                              className={`block rounded-md px-2 py-1.5 transition-colors ${
                                isThreadActive
                                  ? "bg-gray-bg-hover text-warm-black"
                                  : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
                              }`}
                            >
                              <span className="block truncate text-[12px] font-medium">
                                {thread.title || "New chat"}
                              </span>
                              <span className="block truncate text-[10px] text-gray-faint">
                                {thread.preview}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-2 py-1.5 text-[11px] leading-relaxed text-gray-faint">
                        Recent AI chats appear here after the first message.
                      </p>
                    )}
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
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
            href={dashboardHref("/dashboard/settings")}
            prefetch={false}
            onClick={onClose}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
              effectivePathname?.startsWith("/dashboard/settings")
                ? "text-warm-black bg-gray-bg"
                : "text-gray-muted hover:text-warm-black hover:bg-gray-bg"
            }`}
            title="Settings"
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          <button
            type="button"
            onClick={() => {
              const clerk = (window as typeof window & {
                Clerk?: { signOut?: (options?: { redirectUrl?: string }) => Promise<void> };
              }).Clerk;
              if (clerk?.signOut) {
                clerk.signOut({ redirectUrl: "/sign-in" }).catch(() => {
                  window.location.href = "/sign-in";
                });
              } else {
                window.location.href = "/sign-in";
              }
            }}
            className="w-9 h-9 rounded-md flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden h-full w-[276px] shrink-0 p-1 lg:block">
        {sidebarContent("desktop")}
      </div>

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
            {sidebarContent("mobile")}
          </aside>
        </div>
      )}
    </>
  );
}
