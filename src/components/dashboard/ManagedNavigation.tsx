"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Inbox, Plus, Settings, Shield, X } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { useDashboardSurfaces } from "./DashboardSurfacesContext";
import { GROUP_LABELS, SURFACE_ICONS, SURFACE_MATCH } from "./surface-nav";
import type { Thread } from "./HistorySidebar";
import styles from "./managed-navigation.module.css";

interface Props {
  businessName: string;
  pendingCount: number;
  isSuperAdmin: boolean;
  viewAsClient: boolean;
  onToggleViewAsClient: () => void;
  appBase: string;
}

/** Website controls remain tenant-scoped inside the common Strelva navigation. */
export function ManagedNavigation({ businessName, pendingCount, isSuperAdmin, viewAsClient, onToggleViewAsClient, appBase }: Props) {
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const pathname = usePathname();
  const surfaces = useDashboardSurfaces();
  const effectivePath = dashboardBasePath && pathname?.startsWith(dashboardBasePath)
    ? pathname.slice(dashboardBasePath.length) || "/dashboard"
    : pathname || "";

  return (
    <div className={styles.navigation}>
      <h2 title={businessName}>{businessName}</h2>
      <nav aria-label={`${businessName} website`}>
        {pendingCount > 0 && <Link href={dashboardHref("/dashboard/review")} prefetch={false} aria-current={effectivePath.startsWith("/dashboard/review") ? "page" : undefined}>
          <Inbox size={16} aria-hidden="true" /><span>Needs you</span><strong className={styles.count}>{pendingCount}</strong>
        </Link>}
        {(["manage", "presence", "set"] as const).map((group) => {
          const items = surfaces.filter((surface) => surface.group === group);
          return items.length ? <div key={group} role="group" aria-label={GROUP_LABELS[group]}>
            {group === "set" && <h2>{GROUP_LABELS[group]}</h2>}
            {items.map((item) => {
              const Icon = SURFACE_ICONS[item.id];
              const active = item.id === "today" ? effectivePath === "/dashboard" : SURFACE_MATCH[item.id].some((match) => effectivePath.startsWith(match));
              return <Link key={item.id} href={dashboardHref(item.href)} prefetch={false} aria-current={active ? "page" : undefined} title={item.preview ? "Not enabled for this client: operator preview" : undefined}>
                <Icon size={16} aria-hidden="true" /><span>{item.label}</span>
                {item.preview ? <small className={styles.preview}>Off</small> : item.state === "connect" && item.id !== "reviews" ? <small>Connect</small> : null}
              </Link>;
            })}
          </div> : null;
        })}
        <Link href={dashboardHref("/dashboard/settings")} prefetch={false} aria-current={effectivePath.startsWith("/dashboard/settings") ? "page" : undefined}>
          <Settings size={16} aria-hidden="true" /><span>Website settings</span>
        </Link>
      </nav>
      {effectivePath.startsWith("/dashboard/chat") && <ManagedHistory key={dashboardHref("/dashboard/chat")} />}
      {isSuperAdmin && <div className={styles.operator}>
        <h2>Operator</h2>
        {!viewAsClient && <Link href={`${appBase}/admin`}><Shield size={16} aria-hidden="true" /><span>Operator console</span></Link>}
        <button type="button" aria-pressed={viewAsClient} onClick={onToggleViewAsClient}>
          {viewAsClient ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}<span>{viewAsClient ? "Exit client view" : "View as client"}</span>
        </button>
      </div>}
    </div>
  );
}

function ManagedHistory() {
  const { dashboardHref } = useDashboard();
  const activeThread = useSearchParams().get("thread");
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(dashboardHref("/api/threads"), { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Conversations could not be loaded.");
        const data: unknown = await response.json();
        const list = (Array.isArray(data) ? data : []) as Array<Thread & { messages?: Array<{ content?: string }> }>;
        if (!controller.signal.aborted) setThreads(list
          .filter((thread) => Boolean(thread.preview?.trim()) || Boolean(thread.messages?.length))
          .slice(0, 6)
          .map((thread) => ({ ...thread, preview: thread.preview || thread.messages?.at(-1)?.content || "" })));
      })
      .catch(() => { if (!controller.signal.aborted) setError("Conversations could not be loaded. Reopen this page to try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [dashboardHref]);

  async function deleteThread(threadId: string) {
    if (deletingThreadId) return;
    setDeletingThreadId(threadId);
    setError("");
    try {
      const response = await fetch(dashboardHref(`/api/threads/${encodeURIComponent(threadId)}`), { method: "DELETE", credentials: "same-origin" });
      if (!response.ok && response.status !== 404) throw new Error("Delete failed");
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      if (activeThread === threadId) router.push(dashboardHref("/dashboard/chat"));
    } catch {
      setError("This conversation could not be deleted. Try again.");
    } finally {
      setDeletingThreadId(null);
    }
  }

  return <section aria-label="Recent conversations" className={styles.history}>
    <h2>Recent conversations</h2>
    <Link href={dashboardHref("/dashboard/chat")} prefetch={false}><Plus size={16} aria-hidden="true" /><span>New conversation</span></Link>
    {loading ? <p>Loading conversations…</p> : threads.length ? threads.map((thread) => <div className={styles.thread} key={thread.id}>
      <Link href={dashboardHref(`/dashboard/chat?thread=${encodeURIComponent(thread.id)}`)} prefetch={false} aria-current={activeThread === thread.id ? "page" : undefined} title={thread.title || "Conversation"}>
        <span><strong>{thread.title || "Conversation"}</strong><small>{thread.preview}</small></span>
      </Link>
      <button className={styles.deleteThread} type="button" disabled={deletingThreadId !== null} onClick={() => void deleteThread(thread.id)} aria-label={`Delete ${thread.title || "conversation"}`}><X size={16} aria-hidden="true" /></button>
    </div>) : !error ? <p>Your conversations appear here after the first message.</p> : null}
    {error && <p role="status">{error}</p>}
  </section>;
}
