import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { getDomainHealth } from "@/lib/domain-monitor-store";
import { UptimeBoard } from "./UptimeBoard";

export const dynamic = "force-dynamic";

/** Stored monitor evidence is qualified in the board; Run again explicitly refreshes it. */
export default async function UptimePage() {
  await authorizeAdminOperatorRead("admin.uptime.read");
  const stored = await getDomainHealth().catch(() => null);
  const results = stored?.results ?? [];
  const scannedAt = stored?.scannedAt ?? null;

  return <UptimeBoard initialResults={results} initialScannedAt={scannedAt} initialAvailable={Boolean(stored)} />;
}
