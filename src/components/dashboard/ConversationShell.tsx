"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Inbox, Menu, MessageCircle, Settings, ShieldAlert } from "lucide-react";
import { AppFrame, useHydrationReady } from "@/experience/app-frame";
import { MANAGED_WEBSITES_COPY, MANAGED_WEBSITES_LABEL } from "@/products/managed-presence";
import { HistorySidebar } from "./HistorySidebar";
import { MobileNav } from "./MobileNav";
import { SectionSubNav } from "./SectionSubNav";
import { ChatPanel } from "./ChatPanel";
import { useDashboard } from "./DashboardContext";
import { useDashboardSurfaces } from "./DashboardSurfacesContext";
import { SURFACE_ICONS, SURFACE_MATCH } from "./surface-nav";

interface ConversationShellProps {
  children: ReactNode;
  businessName: string;
  businessLogoUrl?: string;
  accountName: string;
  accountEmail?: string | null;
  isSuperAdmin?: boolean;
  pendingCount?: number;
  /** Whether the tenant runs a storefront — adds the Store sub-tab to the Website sub-nav. */
  hasStore?: boolean;
  /** Super-admin inspect mode is active — show the inspect strip + preview markers. */
  inspect?: boolean;
  /** Business name shown in the "Inspecting {name}" strip. */
  inspectTenantName?: string;
  /** Exit-inspect link (clears the cookie, returns to the admin client page). */
  inspectExitHref?: string;
}

export function ConversationShell({
  children,
  businessName,
  businessLogoUrl,
  accountName,
  accountEmail,
  isSuperAdmin = false,
  pendingCount = 0,
  hasStore = false,
  inspect = false,
  inspectTenantName,
  inspectExitHref,
}: ConversationShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Admins can preview the dashboard exactly as the client sees it — hides the
  // admin chrome (impersonation banner + Admin badge). Cosmetic only; it changes
  // nothing about permissions or what the API will accept.
  const [viewAsClient, setViewAsClient] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const hydrationReady = useHydrationReady();
  const pathname = usePathname();
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);
  const discussionTriggerRef = useRef<HTMLButtonElement>(null);
  const { dashboardBasePath, impersonation, relationship } = useDashboard();
  const effectivePathname =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname || "";
  // The full chat route remains the canonical conversation view. A compact
  // discussion rail is offered only beside concrete managed work, so the
  // layout never mounts two tenant conversations on /dashboard/chat.
  const isChatRoute =
    effectivePathname === "/dashboard/chat" || effectivePathname.startsWith("/dashboard/chat/");

  useEffect(() => {
    if (!isChatRoute) return;
    const frame = window.requestAnimationFrame(() => setDiscussionOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [isChatRoute]);

  return (
    <AppFrame
      navigationLabel={MANAGED_WEBSITES_COPY.navigationLabel}
      navigation={
        <div id="managed-navigation">
          <HistorySidebar
            businessName={businessName}
            businessLogoUrl={businessLogoUrl}
            accountName={accountName}
            accountEmail={accountEmail}
            isSuperAdmin={isSuperAdmin}
            viewAsClient={viewAsClient}
            onToggleViewAsClient={isSuperAdmin ? () => setViewAsClient((v) => !v) : undefined}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            pendingCount={pendingCount}
            relationship={relationship}
            inspect={inspect}
            inspectTenantName={inspectTenantName}
            inspectExitHref={inspectExitHref}
          />
        </div>
      }
      collapsedNavigation={<CollapsedManagedNavigation pendingCount={pendingCount} />}
      className="dashboard-gradient"
      contentId="main-content"
      notice={impersonation.isActive && !viewAsClient ? (
        <div className="shrink-0 border-b border-warning/30 bg-warning/12 px-4 py-2 text-warning">
          <div className="flex items-center gap-2 px-4 py-2 text-[12px]">
            <ShieldAlert className="h-4 w-4 text-warning" strokeWidth={1.7} />
            <span className="font-medium text-warning">Acting as Strelva admin</span>
            <span className="hidden text-warning/80 sm:inline">
              {impersonation.actorEmail || "Super admin"} is viewing tenant {impersonation.tenantId}. Admin saves are audit logged.
            </span>
          </div>
        </div>
      ) : null}
      header={
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 lg:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={mobileNavigationTriggerRef}
              type="button"
              onClick={() => setSidebarOpen(true)}
              disabled={!hydrationReady}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black lg:hidden"
              aria-label="Open navigation"
              aria-controls="managed-navigation"
              aria-expanded={sidebarOpen}
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <div className="min-w-0">
              <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-muted lg:inline">
                {MANAGED_WEBSITES_LABEL}
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-muted lg:hidden">
                {MANAGED_WEBSITES_LABEL}
              </span>
              <span className="block truncate text-[13px] text-warm-black lg:inline lg:pl-3">{businessName || "Dashboard"}</span>
              <span className="block truncate text-[11px] leading-tight text-gray-muted lg:hidden">Strelva</span>
            </div>
          </div>
          {!isChatRoute && (
            <button
              ref={discussionTriggerRef}
              type="button"
              onClick={() => setDiscussionOpen((open) => !open)}
              disabled={!hydrationReady}
              className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-gray-border bg-surface-raised px-2.5 text-[12px] font-medium text-warm-black transition-colors hover:border-accent/35 sm:px-3"
              aria-expanded={discussionOpen}
              aria-controls="managed-discussion"
            >
              <MessageCircle className="h-4 w-4 text-gray-muted" strokeWidth={1.5} />
              <span>{MANAGED_WEBSITES_COPY.discussionLabel}</span>
            </button>
          )}
        </div>
      }
      rightRail={!isChatRoute ? <OptionalManagedDiscussion open={discussionOpen} ownerName={accountName} /> : undefined}
      rightRailId="managed-discussion"
      rightRailTitle={MANAGED_WEBSITES_COPY.discussionLabel}
      rightRailOpen={!isChatRoute && discussionOpen}
      onCloseRightRail={() => setDiscussionOpen(false)}
      rightRailTriggerRef={discussionTriggerRef}
      navigationOpen={sidebarOpen}
      onCloseNavigation={() => setSidebarOpen(false)}
      navigationTriggerRef={mobileNavigationTriggerRef}
    >
      {/* The single Website sub-nav (Preview / Content / Media / Store / History);
          null on every non-Website route. */}
      <SectionSubNav hasStore={hasStore} />

      {/* Content — add bottom padding on mobile for tab bar */}
      <div className="flex min-h-0 flex-1 pb-16 lg:pb-0">{children}</div>

      {/* Mobile bottom tab bar */}
      <MobileNav pendingCount={pendingCount} />
    </AppFrame>
  );
}

/** Keep the full tenant conversation dormant until the contextual rail opens. */
function OptionalManagedDiscussion({ open, ownerName }: { open: boolean; ownerName: string }) {
  return open ? <ChatPanel ownerName={ownerName} variant="compact" /> : null;
}

function CollapsedManagedNavigation({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const surfaces = useDashboardSurfaces();
  const effectivePathname =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname || "";

  return (
    <nav className="flex h-full w-full flex-col items-center py-3" aria-label="Managed Websites collapsed navigation">
      <span
        className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-gray-border bg-surface-raised font-display text-sm font-medium text-warm-black"
        title={MANAGED_WEBSITES_LABEL}
        aria-label={MANAGED_WEBSITES_LABEL}
      >
        MW
      </span>
      <div className="flex w-full flex-col items-center gap-1">
        {pendingCount > 0 && (
          <Link
            href={dashboardHref("/dashboard/review")}
            prefetch={false}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              effectivePathname.startsWith("/dashboard/review")
                ? "bg-gray-bg-hover text-warm-black"
                : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
            }`}
            aria-label={`Needs you, ${pendingCount} waiting for approval`}
            title={`Needs you (${pendingCount})`}
            aria-current={effectivePathname.startsWith("/dashboard/review") ? "page" : undefined}
          >
            <Inbox className="h-4 w-4" strokeWidth={1.5} />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          </Link>
        )}
        {surfaces.map((item) => {
          const Icon = SURFACE_ICONS[item.id];
          const active = item.id === "today"
            ? effectivePathname === "/dashboard"
            : SURFACE_MATCH[item.id].some((match) => effectivePathname.startsWith(match));
          return (
            <Link
              key={item.id}
              href={dashboardHref(item.href)}
              prefetch={false}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                active
                  ? "bg-gray-bg-hover text-warm-black"
                  : item.preview || item.state === "connect"
                    ? "text-gray-faint hover:bg-gray-bg hover:text-warm-black"
                    : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
              }`}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.preview ? `${item.label} (operator preview)` : item.label}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          );
        })}
      </div>
      <Link
        href={dashboardHref("/dashboard/settings")}
        prefetch={false}
        className={`mt-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          effectivePathname.startsWith("/dashboard/settings")
            ? "bg-gray-bg-hover text-warm-black"
            : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
        }`}
        aria-label="Settings"
        title="Settings"
        aria-current={effectivePathname.startsWith("/dashboard/settings") ? "page" : undefined}
      >
        <Settings className="h-4 w-4" strokeWidth={1.5} />
      </Link>
    </nav>
  );
}
