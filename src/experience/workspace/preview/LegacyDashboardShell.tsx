"use client";
/**
 * The real legacy dashboard shell (DashboardProvider, surfaces, ConversationShell)
 * around fixture pages. Fictional business; every API call goes to the
 * preview's fixture route under LEGACY_BASE. Nothing reaches a real tenant.
 */
import type { ReactNode } from "react";
import { ConversationShell } from "@/components/dashboard/ConversationShell";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { DashboardSurfacesProvider } from "@/components/dashboard/DashboardSurfacesContext";
import { DashNote } from "@/components/dashboard/xa/DashboardXa";
import { resolveRelationship } from "@/platform/relationships";
import { LEGACY_BASE, LEGACY_BUSINESS, LEGACY_EMAIL, LEGACY_OWNER, LEGACY_SITE_FIXTURE, LEGACY_SURFACES, LEGACY_TENANT } from "./legacy-dashboard-fixtures";

export function LegacyDashboardShell({ children, mode, pendingCount, hasStore = true, billing, inspect = false }: {
  children: ReactNode;
  mode: "light" | "dark";
  pendingCount: number;
  hasStore?: boolean;
  billing?: "past_due" | "none";
  inspect?: boolean;
}) {
  return <DashboardProvider tenantId={LEGACY_TENANT} dashboardBasePath={LEGACY_BASE} siteModel="wellness" siteUrl="" previewUrl={LEGACY_SITE_FIXTURE} autoPublish={false}
    subscriptionStatus={billing ?? "active"}
    relationship={resolveRelationship({ context: { kind: "tenant", tenantId: LEGACY_TENANT }, serviceRelationship: "managed_client", paidStanding: "active" })}
    impersonation={{ isActive: false, actorEmail: LEGACY_EMAIL, actorName: LEGACY_OWNER, isSuperAdmin: false, tenantId: LEGACY_TENANT }}>
    <DashboardSurfacesProvider surfaces={LEGACY_SURFACES}>
      <ConversationShell businessName={LEGACY_BUSINESS} accountName={LEGACY_OWNER} accountEmail={LEGACY_EMAIL} pendingCount={pendingCount} hasStore={hasStore}
        signOut={null} appBase="/preview/strelva" mode={mode} inspect={inspect} inspectTenantName={LEGACY_BUSINESS} inspectExitHref={LEGACY_BASE}
        notes={<>
          <DashNote tone="quiet">Fictional preview. Nothing here reaches a real business.</DashNote>
          {billing === "past_due" ? <DashNote tone="down" role="alert" links={[<span key="card" className="font-medium text-[var(--st-accent)]">Update your card</span>]}>Your last payment didn&apos;t go through. Update your card to keep your site running.</DashNote> : null}
        </>}>
        {children}
      </ConversationShell>
    </DashboardSurfacesProvider>
  </DashboardProvider>;
}
