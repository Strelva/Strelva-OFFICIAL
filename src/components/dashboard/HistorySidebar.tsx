"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Settings,
  Search,
  X,
  LogOut,
  Plus,
  Inbox,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { PropertySwitcher } from "./PropertySwitcher";
import { useDashboardSurfaces } from "./DashboardSurfacesContext";
import { SURFACE_ICONS, GROUP_LABELS, SURFACE_MATCH } from "./surface-nav";
import { createBrowserSupabase } from "@/lib/db/browser-client";

/** Ends the active session (Supabase first, Clerk fallback) then returns to sign-in. */
async function signOutEverywhere() {
  try {
    const supabase = createBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
  } catch {
    // ignore — fall through to redirect so the user always leaves
  }
  const clerk = (window as typeof window & {
    Clerk?: { signOut?: (options?: { redirectUrl?: string }) => Promise<void> };
  }).Clerk;
  if (clerk?.signOut) {
    try {
      await clerk.signOut();
    } catch {
      // ignore
    }
  }
  window.location.href = "/sign-in";
}

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

/** The client's favicon as their logo, derived from their site domain. Falls back
 *  to the name's initial if there's no domain or the favicon fails to load. */
function SidebarLogo({ name, siteUrl }: { name: string; siteUrl?: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try {
    if (siteUrl) host = new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const favicon = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : "";

  if (favicon && !failed) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-border bg-surface-raised">
        <img
          src={favicon}
          alt=""
          width={16}
          height={16}
          className="h-4 w-4 object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-border bg-surface-raised text-[11px] font-semibold text-warm-black">
      {(name || "S").slice(0, 1).toUpperCase()}
    </div>
  );
}

export function HistorySidebar({
  ownerName,
  isOpen = true,
  onClose,
  pendingCount = 0,
  valueProof,
}: HistorySidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dashboardBasePath, dashboardHref, siteUrl } = useDashboard();
  const surfaces = useDashboardSurfaces();
  const navGroups = (["manage", "presence"] as const)
    .map((id) => ({ id, label: GROUP_LABELS[id], items: surfaces.filter((s) => s.group === id) }))
    .filter((g) => g.items.length > 0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const activeThread = searchParams.get("thread");
  const effectivePathname =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname;
  const isChatRoute = effectivePathname?.startsWith("/dashboard/chat");

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

  async function deleteThread(threadId: string) {
    if (deletingThreadId) return;
    const previousThreads = threads;
    const wasActive = activeThread === threadId;

    setDeletingThreadId(threadId);
    setThreads((current) => current.filter((thread) => thread.id !== threadId));
    if (wasActive) {
      router.push(dashboardHref("/dashboard/chat"));
      onClose?.();
    }

    try {
      const response = await fetch(dashboardHref(`/api/threads/${threadId}`), {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok && response.status !== 404) {
        throw new Error("Could not delete chat");
      }
    } catch {
      setThreads(previousThreads);
      if (wasActive) {
        router.push(dashboardHref(`/dashboard/chat?thread=${threadId}`));
      }
    } finally {
      setDeletingThreadId(null);
    }
  }

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
        <span className="text-[13px] font-medium text-warm-black">Strelva</span>
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
          <SidebarLogo name={ownerName} siteUrl={siteUrl} />
          <div className="min-w-0">
            <PropertySwitcher fallbackName={ownerName} />
            <p className="truncate text-[11px] leading-tight text-gray-muted">{valueProof || "Your dashboard"}</p>
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
          {navGroups.map((group) => (
            <li key={group.id}>
              <div className="px-5 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-muted">{group.label}</p>
              </div>
              <ul className="px-3 pb-5">
                {group.id === "manage" && pendingCount > 0 && (
                  <li className="py-0.5">
                    <Link
                      href={dashboardHref("/dashboard/review")}
                      prefetch={false}
                      onClick={onClose}
                      className="group flex min-h-[42px] w-full items-center gap-3 rounded-lg bg-accent-dim px-3 py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent-dim/80"
                    >
                      <Inbox className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span className="flex-1 truncate">Needs you</span>
                      <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-surface-base">
                        {pendingCount}
                      </span>
                    </Link>
                  </li>
                )}
                {group.items.map((item) => {
                  const isActive = item.id === "today"
                    ? effectivePathname === "/dashboard"
                    : SURFACE_MATCH[item.id].some((m) => effectivePathname?.startsWith(m));
                  const Icon = SURFACE_ICONS[item.id];
                  const isConnect = item.state === "connect";
                  return (
                    <li key={item.id} className="py-0.5">
                      <Link
                        href={dashboardHref(item.href)}
                        prefetch={false}
                        onClick={onClose}
                        className={`group flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                          isActive
                            ? "bg-gray-bg-hover text-warm-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]"
                            : isConnect
                              ? "text-gray-faint hover:bg-gray-bg hover:text-warm-black"
                              : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {isConnect && (
                          <span className="shrink-0 rounded-full border border-gray-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-faint">
                            Connect
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {group.id === "manage" && isChatRoute && (
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
                            <div
                              key={thread.id}
                              className={`group/thread relative rounded-md transition-colors ${
                                isThreadActive
                                  ? "bg-gray-bg-hover text-warm-black"
                                  : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
                              }`}
                            >
                              <Link
                                href={dashboardHref(`/dashboard/chat?thread=${thread.id}`)}
                                prefetch={false}
                                onClick={onClose}
                                className="block min-w-0 px-2 py-1.5 pr-7"
                              >
                                <span className="block truncate text-[12px] font-medium">
                                  {thread.title || "New chat"}
                                </span>
                                <span className="block truncate text-[10px] text-gray-faint">
                                  {thread.preview}
                                </span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  void deleteThread(thread.id);
                                }}
                                disabled={deletingThreadId === thread.id}
                                className="absolute right-1 top-1.5 flex h-5 w-5 items-center justify-center rounded text-gray-faint opacity-60 transition-colors hover:bg-gray-bg-hover hover:text-warm-black hover:opacity-100 focus:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Delete ${thread.title || "chat"}`}
                                title="Delete chat"
                              >
                                <X className="h-3 w-3" strokeWidth={1.8} />
                              </button>
                            </div>
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
              void signOutEverywhere();
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
            className="absolute inset-0 bg-overlay-scrim backdrop-blur-sm"
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
