/**
 * October 16, 2026: only tenants with no business workspace still see
 * /dashboard, and it speaks the workspace's words (GLOSSARY): New request,
 * Home, What changed; the workspace greeting; one "Not yet". Rendered on the
 * server with fixture events; nothing reaches a tenant.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { QueuePage } from "@/components/dashboard/QueuePage";
import { ManagedNavigation } from "@/components/dashboard/ManagedNavigation";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { DashboardSurfacesProvider } from "@/components/dashboard/DashboardSurfacesContext";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { DashGreeting } from "@/components/dashboard/xa/DashboardXa";
import { todayGreeting } from "@/experience/workspace/today/today-model";
import { resolveRelationship } from "@/platform/relationships";
import type { DashboardSurface } from "@/lib/dashboard-surfaces";
import type { UnifiedEvent } from "@/lib/types";

const SURFACES: DashboardSurface[] = [
  { id: "today", label: "Home", href: "/dashboard", state: "shown", group: "manage" },
  { id: "ask-ai", label: "Ask Strelva", href: "/dashboard/chat", state: "shown", group: "manage" },
  { id: "website", label: "Website", href: "/dashboard/site", state: "shown", group: "presence" },
  { id: "analytics", label: "Analytics", href: "/dashboard/analytics", state: "shown", group: "presence" },
  { id: "reports", label: "Reports", href: "/dashboard/reports", state: "shown", group: "presence" },
  { id: "reviews", label: "Reviews", href: "/dashboard/reviews", state: "shown", group: "presence" },
];

function nav(pendingCount: number) {
  return renderToStaticMarkup(
    <DashboardProvider tenantId="fictional" siteUrl="" siteModel="wellness" previewUrl="" autoPublish={false} subscriptionStatus="active"
      relationship={resolveRelationship({ context: { kind: "tenant", tenantId: "fictional" }, serviceRelationship: "managed_client", paidStanding: "active" })}
      impersonation={{ isActive: false, actorEmail: null, actorName: "Owner", isSuperAdmin: false, tenantId: "fictional" }}>
      <DashboardSurfacesProvider surfaces={SURFACES}>
        <ManagedNavigation businessName="Fictional Dental" pendingCount={pendingCount} isSuperAdmin={false} viewAsClient={false} onToggleViewAsClient={() => undefined} appBase="" />
      </DashboardSurfacesProvider>
    </DashboardProvider>,
  );
}

const event: UnifiedEvent = {
  id: "evt_hours", tenantId: "fictional", source: "ai", type: "content_update", title: "Holiday hours on your homepage", body: "",
  status: "pending", createdAt: new Date().toISOString(),
  metadata: { kind: "agent_preview", section: "hero", diffs: [{ field: "Hours note", before: "", after: "Closed Thursday.", type: "added" }] },
};

describe("the dashboard's places use the workspace's words", () => {
  it("draws New request, Home and What changed, and no separate Needs you, Ask Strelva, Visitors or Reports", () => {
    const html = nav(3);
    for (const word of [">New request<", ">Home<", ">What changed<", ">Business details<", ">Website<"]) expect(html, word).toContain(word);
    for (const word of [">Needs you<", ">Ask Strelva<", ">Visitors<", ">Reports<", ">Analytics<", ">Today<"]) expect(html, word).not.toContain(word);
    expect(html).toContain('aria-label="Home, 3 things wait for you"');
    expect(html).toContain('href="/dashboard/chat"');
    expect(html).toContain('href="/dashboard/history"');
  });

  it("says nothing waits when nothing does", () => {
    expect(nav(0)).not.toContain("wait for you");
  });
});

describe("Home's greeting and decline words match the workspace", () => {
  it("greets with the workspace greeting (no clock on the server), never Hello", () => {
    const html = renderToStaticMarkup(createElement(DashGreeting, { name: "Dr. Amy Lin", businessName: "Fictional Dental" }));
    expect(html).toContain(todayGreeting(null, "Dr. Lin"));
    expect(html).not.toContain("Hello");
    expect(renderToStaticMarkup(createElement(DashGreeting, { name: "Fictional Dental", businessName: "Fictional Dental" }))).toContain(`${todayGreeting(null, null)}<`);
  });

  it("offers one Not yet beside the yes, not Not now and Skip", () => {
    const html = renderToStaticMarkup(createElement(QueuePage, { initialPending: [event], initialResolved: [], pendingCount: 1 }));
    expect(html).toContain("Make it live");
    expect(html).toContain(">Not yet<");
    expect(html).not.toContain("Not now");
    expect(html).not.toContain(">Skip<");
  });

  it("names the timeline What changed", () => {
    const html = renderToStaticMarkup(createElement(ActivityFeed, { activity: [{ text: "AI updated hero", time: new Date().toISOString(), type: "ai", actor: "ai", section: "hero", eventStatus: "auto_approved" }], historyHref: "/dashboard/history" }));
    expect(html).toContain("What changed");
    expect(html).not.toContain("What Strelva did");
  });
});
