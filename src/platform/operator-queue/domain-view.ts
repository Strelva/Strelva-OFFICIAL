import type { DomainClaim } from "@/lib/types";
import type { DomainCheck, TenantDomainHealth } from "@/lib/domain-monitor";

/**
 * One domain view per workspace (spec §3.11). The workspace's domain panel and
 * /admin/clients/[id] read this one projection over Strelva's claims (with
 * the hosted-site registration state on each claim) and the domain monitor.
 * Pure: the loader passes the rows in.
 *
 * A domain is health of a Connection; it never changes a System's lifecycle.
 */
export interface DomainViewRow {
  domain: string;
  /** Which System it appears on. */
  system: string;
  role: DomainClaim["role"] | "monitored";
  verification: { status: DomainClaim["status"] | "not_claimed"; dns: DomainClaim["dnsStatus"] | "unknown"; ssl: DomainClaim["sslStatus"] | "unknown"; label: string };
  registration: "not_submitted" | "unknown" | "rejected" | "confirmed" | null;
  uptime: { state: DomainCheck["state"]; label: string } | null;
  expiry: { at: string | null; days: number | null; label: string };
  lastCheckedAt: string | null;
  /** Who can change it, in plain words. */
  whoCanChange: string;
}

export interface DomainViewInput {
  systemLabel: string;
  claims: DomainClaim[];
  monitor: TenantDomainHealth | null;
}

const VERIFICATION_LABELS: Record<string, string> = {
  verified: "Verified",
  pending: "Waiting on DNS",
  misconfigured: "DNS misconfigured",
  error: "Provider error",
  conflict: "Claimed by another site",
  not_claimed: "Not claimed by Strelva",
};

function uptimeLabel(check: DomainCheck): string {
  if (check.state === "up") return "Up";
  if (check.state === "unknown") return "Unknown";
  return `${check.state[0]!.toUpperCase()}${check.state.slice(1)}${check.reason ? `: ${check.reason}` : ""}`;
}

function expiryLabel(check: DomainCheck | undefined): DomainViewRow["expiry"] {
  if (!check || (check.daysToExpiry === null && !check.expiresAt)) return { at: null, days: null, label: "Expiry unknown" };
  const days = check.daysToExpiry;
  return {
    at: check.expiresAt,
    days,
    label: days === null ? `Expires ${check.expiresAt?.slice(0, 10)}` : days <= 0 ? "Expired" : `Expires in ${days} day${days === 1 ? "" : "s"}`,
  };
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function buildDomainView(inputs: DomainViewInput[]): DomainViewRow[] {
  const rows = new Map<string, DomainViewRow>();
  for (const input of inputs) {
    const checks = new Map((input.monitor?.checks ?? []).map((check) => [check.host.toLowerCase(), check]));
    for (const claim of input.claims) {
      const key = claim.domain.toLowerCase();
      const check = checks.get(key);
      rows.set(key, {
        domain: claim.domain,
        system: input.systemLabel,
        role: claim.role,
        verification: { status: claim.status, dns: claim.dnsStatus, ssl: claim.sslStatus, label: VERIFICATION_LABELS[claim.status] ?? claim.status },
        registration: claim.registrationAttempt ?? null,
        uptime: check ? { state: check.state, label: uptimeLabel(check) } : null,
        expiry: expiryLabel(check),
        lastCheckedAt: later(claim.updatedAt, check?.checkedAt ?? null),
        whoCanChange: "The owner changes DNS at their registrar. A Strelva operator can add or remove Strelva's claim; Strelva never removes the domain from Vercel.",
      });
    }
    // Hosts the monitor watches that Strelva has no claim for (the platform
    // address, a production domain set before claims existed).
    for (const check of input.monitor?.checks ?? []) {
      const key = check.host.toLowerCase();
      if (rows.has(key)) continue;
      rows.set(key, {
        domain: check.host,
        system: input.systemLabel,
        role: "monitored",
        verification: { status: "not_claimed", dns: "unknown", ssl: "unknown", label: check.kind === "platform" ? "Strelva address" : VERIFICATION_LABELS.not_claimed! },
        registration: null,
        uptime: { state: check.state, label: uptimeLabel(check) },
        expiry: expiryLabel(check),
        lastCheckedAt: check.checkedAt,
        whoCanChange: check.kind === "platform" ? "Strelva manages this address." : "The owner, at their registrar.",
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.system.localeCompare(b.system) || a.domain.localeCompare(b.domain));
}
