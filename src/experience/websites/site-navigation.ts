import { NATIVE_TABS, REQUEST_TABS, type SiteTab } from "@/platform/workspaces/site-places";

export type WebsiteEntryPath = "connect" | "rebuild";

export function websiteEntryPath(connect: boolean, rebuild: boolean, requested: string | null): WebsiteEntryPath | null {
  if (requested === "connect") return connect ? "connect" : null;
  if (requested === "rebuild") return rebuild ? "rebuild" : null;
  return connect === rebuild ? null : connect ? "connect" : "rebuild";
}

/** Managed owners request and review work. Tenant editing stays with operators. */
export function managedSiteNavigation(editing: "native" | "request", operator: boolean, requested: SiteTab | null) {
  const tabs: readonly SiteTab[] = operator ? editing === "native" ? NATIVE_TABS : REQUEST_TABS : ["request", "history"];
  const tab = requested && (tabs.includes(requested) || (requested === "source" && tabs.includes("connections")) || (operator && requested === "request")) ? requested : tabs[0]!;
  return { tab, tabs: operator && editing === "native" && tab === "request" ? [...tabs, "request" as const] : tabs };
}
