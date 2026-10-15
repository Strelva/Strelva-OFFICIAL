import { builtInAppReleaseMayReach } from "@/platform/app-releases/server";

/**
 * Server-side switches for Care plan reports. Not browser-safe: it reads env.
 * Nothing here turns anything on; every switch is off unless set.
 */
type Env = Record<string, string | undefined>;

/** The App's gates (STRELVA_WORKSPACE_RELEASE and STRELVA_CARE_REPORTS_RELEASE) allow it somewhere. The per-business flag row decides the rest. */
export function careReportsMayBeOn(env: Env = process.env): boolean {
  return builtInAppReleaseMayReach("care_reports", "care_reports.baseline", env);
}

/** Emailing a shared Release to the owner. Off by decision: it also needs email sending itself on. */
export function careReportEmailEnabled(env: Env = process.env): boolean {
  return env.STRELVA_CARE_REPORT_EMAIL?.trim() === "1" && env.EMAIL_SENDING_ENABLED === "true";
}

/** Unguessable read-only links for owners without an account. */
export function careReportShareLinksEnabled(env: Env = process.env): boolean {
  return careReportsMayBeOn(env) && env.STRELVA_CARE_REPORT_SHARE_LINKS?.trim() === "1";
}
