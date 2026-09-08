"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ConversationShell } from "./ConversationShell";
import { DashboardProvider } from "./DashboardContext";
import { DashboardSurfacesProvider } from "./DashboardSurfacesContext";
import { ChatPanel } from "./ChatPanel";
import { resolveRelationship } from "@/platform/relationships";
import type { DashboardSurface } from "@/lib/dashboard-surfaces";

const base = "/preview/strelva/website";
const surfaces: DashboardSurface[] = [
  { id: "today", label: "Today", href: "/dashboard", state: "shown", group: "manage" },
  { id: "ask-ai", label: "Ask Strelva", href: "/dashboard/chat", state: "shown", group: "manage" },
  { id: "website", label: "Website", href: "/dashboard/site", state: "shown", group: "presence" },
  { id: "google-business", label: "Google Business", href: "/dashboard/google", state: "connect", group: "presence" },
  { id: "analytics", label: "Analytics", href: "/dashboard/analytics", state: "shown", group: "presence" },
  { id: "reports", label: "Reports", href: "/dashboard/reports", state: "shown", group: "presence" },
  { id: "reviews", label: "Reviews", href: "/dashboard/reviews", state: "connect", group: "presence" },
];

/** Synthetic content, real shell. The route guard and prefixed API handlers isolate this fixture. */
export function ManagedPreview() {
  const pathname = usePathname();
  const threadId = useSearchParams().get("thread") || undefined;
  const route = pathname.slice(base.length) || "/dashboard";
  const isChat = route.startsWith("/dashboard/chat");
  const pageName = surfaces.find((surface) => surface.href === route)?.label || (route.includes("settings") ? "Website settings" : "Website");

  return <DashboardProvider tenantId="preview-business" dashboardBasePath={base} siteUrl="https://example.com" readOnly autoPublish={false} relationship={resolveRelationship({ context: { kind: "tenant", tenantId: "preview-business" }, serviceRelationship: "managed_client", paidStanding: "active" })}>
    <DashboardSurfacesProvider surfaces={surfaces}>
      <ConversationShell businessName="Elmwood Studio" accountName="Alex Morgan" accountEmail="alex@example.com" pendingCount={0} signOut={null} appBase="/preview/strelva">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-border px-6 py-3 text-[12px] text-gray-muted"><span>Local interface preview · fictional business · no live actions</span><Link href="/preview/strelva?scenario=managed" className="underline underline-offset-4">Back to workspace preview</Link></div>
          {isChat ? <ChatPanel ownerName="Alex Morgan" threadId={threadId} /> : <div className="min-h-0 flex-1 overflow-auto px-6 py-8 md:px-8 lg:px-12">
            <div className="mx-auto max-w-[960px]">
              <p className="text-[14px] text-gray-muted">Elmwood Studio</p>
              <h1 className="mt-2 font-display text-[32px] leading-[40px] text-warm-black">{pageName}</h1>
              <p className="mt-4 max-w-[65ch] text-[16px] leading-6 text-gray-muted">This fictional website lets you inspect the shared navigation, website sections, account context, and Ask Strelva panel. Existing website pages keep their own data and permission checks in the actual product.</p>
              <div className="mt-8 border-y border-gray-border py-6">
                <h2 className="text-[16px] font-medium text-warm-black">Example website drafts</h2>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4"><div><p className="text-[14px] text-warm-black">Update the studio hours</p><p className="mt-1 text-[14px] text-gray-muted">Fictional draft · nothing has been published</p></div><span className="text-[12px] text-gray-muted">Preview only</span></div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-border pt-4"><div><p className="text-[14px] text-warm-black">Revise the booking introduction</p><p className="mt-1 text-[14px] text-gray-muted">Fictional draft · nothing has been published</p></div><span className="text-[12px] text-gray-muted">Preview only</span></div>
              </div>
              <Link href={`${base}/dashboard/chat`} className="mt-6 inline-flex min-h-12 items-center rounded-xl border border-gray-border px-4 text-[14px] text-warm-black">Open conversations</Link>
            </div>
          </div>}
        </div>
      </ConversationShell>
    </DashboardSurfacesProvider>
  </DashboardProvider>;
}
