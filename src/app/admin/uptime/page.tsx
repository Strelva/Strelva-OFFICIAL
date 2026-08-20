import { getDomainHealth } from "@/lib/domain-monitor-store";
import { scanPortfolioDomains } from "@/lib/domain-monitor";
import { UptimeBoard } from "./UptimeBoard";

export const dynamic = "force-dynamic";

/**
 * Admin uptime board — the operator's at-a-glance view of every client domain's
 * health (up / down / parked / expiring). Reads the latest stored scan (written
 * by the domain-monitor cron every 30 min); falls back to a live scan the first
 * time, before the cron has run or when Redis is unavailable (dev).
 */
export default async function UptimePage() {
  const stored = await getDomainHealth();
  const results = stored?.results ?? (await scanPortfolioDomains());
  const scannedAt = stored?.scannedAt ?? new Date().toISOString();

  return <UptimeBoard initialResults={results} initialScannedAt={scannedAt} />;
}
