/**
 * Whether the Strelva lines are on a connected site and reporting. Pure and
 * browser-safe: it reads the stored evidence it is handed.
 */
import type { ConnectedSite } from "./contracts";

export const STOPPED_REPORTING_AFTER_MS = 7 * 24 * 3600 * 1000;

export type ConnectedSiteHealthState = "disconnected" | "not_installed" | "installed" | "reporting" | "stopped" | "unreachable";
export interface ConnectedSiteHealth { state: ConnectedSiteHealthState; label: string; detail: string; tone: "live" | "need" | "draft" | "down" }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const after = (a: string | null | undefined, b: string | null | undefined) => a != null && (b == null || Date.parse(a) > Date.parse(b));

export function connectedSiteHealth(
  site: Pick<ConnectedSite, "status" | "siteHost" | "verifiedAt" | "lastEventAt" | "lastCheckedAt" | "lastCheckResult">,
  now = Date.now(),
): ConnectedSiteHealth {
  const host = site.siteHost;
  if (site.status === "revoked") return { state: "disconnected", label: "Disconnected", detail: `Strelva no longer takes anything from ${host}.`, tone: "draft" };
  if (!site.verifiedAt) return { state: "not_installed", label: "Not installed yet", detail: `Add the two lines to ${host}, publish, then check.`, tone: "need" };
  if (site.lastCheckResult === "missing" && after(site.lastCheckedAt, site.lastEventAt ?? site.verifiedAt)) {
    return { state: "stopped", label: "Stopped reporting", detail: `The Strelva lines are no longer on ${host}’s live page. Paste them again, publish, then check.`, tone: "down" };
  }
  if (site.lastCheckResult === "unreachable" && after(site.lastCheckedAt, site.lastEventAt)) {
    return { state: "unreachable", label: "Couldn’t open the site", detail: `Strelva couldn’t open ${host} at the last check. The site may be down or blocking checks.`, tone: "need" };
  }
  if (!site.lastEventAt) return { state: "installed", label: "Installed · no visits yet", detail: "The lines are on the page. Visits show here once people use the site.", tone: "draft" };
  if (now - Date.parse(site.lastEventAt) > STOPPED_REPORTING_AFTER_MS) {
    return { state: "stopped", label: "Stopped reporting", detail: `No visits reported since ${day(site.lastEventAt)}. Check the Strelva lines are still on the page.`, tone: "down" };
  }
  return { state: "reporting", label: "Installed and reporting", detail: `Last visit ${day(site.lastEventAt)}.`, tone: "live" };
}
