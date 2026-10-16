"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Eye, EyeOff, Inbox, Plus, Shield, Sun, X } from "lucide-react";
import { XaGlideList, XaSystemTile } from "@/components/ui/strelva/Xa";
import type { DashboardSurface, SurfaceId } from "@/lib/dashboard-surfaces";
import { useDashboard } from "./DashboardContext";
import { useDashboardSurfaces } from "./DashboardSurfacesContext";
import { SURFACE_ICONS, SURFACE_MATCH } from "./surface-nav";
import type { ThreadSummary } from "@/lib/conversation-types";
import styles from "./managed-navigation.module.css";

interface Props {
  businessName: string;
  pendingCount: number;
  isSuperAdmin: boolean;
  viewAsClient: boolean;
  onToggleViewAsClient: () => void;
  appBase: string;
}

/** Nav words for the owner (GLOSSARY): the surfaces keep their ids and routes. */
const NAV_LABELS: Partial<Record<SurfaceId, string>> = {
  "google-business": "Google listing",
  schedule: "Bookings",
  roster: "Bookings",
  analytics: "Visitors",
};
/** Surfaces that are Systems show their clay; the rest are places with a line icon. */
const SURFACE_CLAY: Partial<Record<SurfaceId, string>> = {
  website: "website", "google-business": "listing", reviews: "reviews", schedule: "bookings", roster: "bookings", members: "form",
};

/** Website controls remain tenant-scoped inside the common Strelva navigation. */
export function ManagedNavigation({ businessName, pendingCount, isSuperAdmin, viewAsClient, onToggleViewAsClient, appBase }: Props) {
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const pathname = usePathname();
  const surfaces = useDashboardSurfaces();
  const effectivePath = dashboardBasePath && pathname?.startsWith(dashboardBasePath)
    ? pathname.slice(dashboardBasePath.length) || "/dashboard"
    : pathname || "";
  const isActive = (item: DashboardSurface) => item.id === "today" ? effectivePath === "/dashboard"
    : SURFACE_MATCH[item.id].some((match) => effectivePath.startsWith(match)) || (item.id === "schedule" && effectivePath.startsWith("/dashboard/roster"));
  const places = surfaces.filter((surface) => !SURFACE_CLAY[surface.id]);
  // Bookings is one System: when the full Bookings page exists, today's roster
  // lives inside it (its Today view), so the rail never shows two bookings rows.
  const hasSchedule = surfaces.some((surface) => surface.id === "schedule");
  const systems = surfaces.filter((surface) => SURFACE_CLAY[surface.id] && !(surface.id === "roster" && hasSchedule));
  const aside = (item: DashboardSurface) => item.preview ? <small className={styles.aside} data-tone="waits">Off for this business</small>
    : item.state === "connect" && item.id !== "reviews" ? <small className={styles.aside}>Not connected</small> : null;

  return (
    <div className={styles.navigation}>
      <XaGlideList as="nav" label={`${businessName} website`} className={styles.list}>
        <div className={styles.group} role="group" aria-label="Places">
          {places.filter((item) => item.id === "today").map((item) => <Link key={item.id} className={styles.item} href={dashboardHref(item.href)} prefetch={false} aria-current={isActive(item) ? "page" : undefined}>
            <Sun size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.label}>{NAV_LABELS[item.id] ?? item.label}</span>
          </Link>)}
          {pendingCount > 0 && <Link className={styles.item} href={dashboardHref("/dashboard/review")} prefetch={false} aria-current={effectivePath === "/dashboard/review" || effectivePath.startsWith("/dashboard/review/") ? "page" : undefined} aria-label={`Needs you, ${pendingCount} waiting`}>
            <Inbox size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.label}>Needs you</span><span className={styles.count} aria-hidden="true"><span className={styles.dot} />{pendingCount > 99 ? "99+" : pendingCount}</span>
          </Link>}
          {places.filter((item) => item.id !== "today").map((item) => {
            const Icon = SURFACE_ICONS[item.id];
            return <Link key={item.id} className={styles.item} href={dashboardHref(item.href)} prefetch={false} aria-current={isActive(item) ? "page" : undefined} title={item.preview ? "Not on for this business: operator preview" : undefined}>
              <Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.label}>{NAV_LABELS[item.id] ?? item.label}</span>{aside(item)}
            </Link>;
          })}
        </div>
        {systems.length ? <div className={styles.group} role="group" aria-label="Your business">
          <h2 className={styles.head}>Your business</h2>
          {systems.map((item) => <Link key={item.id} className={styles.system} href={dashboardHref(item.href)} prefetch={false} aria-current={isActive(item) ? "page" : undefined} title={item.preview ? "Not on for this business: operator preview" : undefined}>
            <XaSystemTile kind={SURFACE_CLAY[item.id]} size={26} /><span className={styles.label}>{NAV_LABELS[item.id] ?? item.label}</span>{aside(item)}
          </Link>)}
        </div> : null}
        <div className={styles.group} role="group" aria-label="Business details">
          <Link className={styles.item} href={dashboardHref("/dashboard/settings")} prefetch={false} aria-current={effectivePath.startsWith("/dashboard/settings") ? "page" : undefined}>
            <Building2 size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.label}>Business details</span>
          </Link>
        </div>
      </XaGlideList>
      {effectivePath.startsWith("/dashboard/chat") && <ManagedHistory key={dashboardHref("/dashboard/chat")} />}
      {isSuperAdmin && <div className={styles.group} role="group" aria-label="Strelva">
        <h2 className={styles.head}>Strelva</h2>
        {!viewAsClient && <Link className={styles.item} href={`${appBase}/admin`}><Shield size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.label}>Operator console</span></Link>}
        <button className={styles.item} type="button" aria-pressed={viewAsClient} onClick={onToggleViewAsClient}>
          {viewAsClient ? <EyeOff size={17} strokeWidth={1.7} aria-hidden="true" /> : <Eye size={17} strokeWidth={1.7} aria-hidden="true" />}<span className={styles.label}>{viewAsClient ? "Stop seeing it as the owner" : "See it as the owner"}</span>
        </button>
      </div>}
    </div>
  );
}

function ManagedHistory() {
  const { dashboardHref } = useDashboard();
  const activeThread = useSearchParams().get("thread");
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(dashboardHref("/api/threads"), { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Conversations could not be loaded.");
        const data: unknown = await response.json();
        const list = (Array.isArray(data) ? data : []) as Array<ThreadSummary & { messages?: Array<{ content?: string }> }>;
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

  return <section aria-label="Recent conversations" className={styles.group}>
    <h2 className={styles.head}>Recent conversations</h2>
    <Link className={styles.item} href={dashboardHref("/dashboard/chat")} prefetch={false}><Plus size={17} strokeWidth={1.7} aria-hidden="true" /><span className={styles.label}>New conversation</span></Link>
    {loading ? <p className={styles.quiet}>Loading conversations</p> : threads.length ? threads.map((thread) => <div className={styles.thread} key={thread.id}>
      <Link className={styles.item} href={dashboardHref(`/dashboard/chat?thread=${encodeURIComponent(thread.id)}`)} prefetch={false} aria-current={activeThread === thread.id ? "page" : undefined} title={thread.title || "Conversation"}>
        <span><strong>{thread.title || "Conversation"}</strong><small>{thread.preview}</small></span>
      </Link>
      <button className={styles.deleteThread} type="button" disabled={deletingThreadId !== null} onClick={() => void deleteThread(thread.id)} aria-label={`Delete ${thread.title || "conversation"}`}><X size={15} aria-hidden="true" /></button>
    </div>) : !error ? <p className={styles.quiet}>Your conversations appear here after the first message.</p> : null}
    {error && <p className={styles.quiet} role="status">{error}</p>}
  </section>;
}
