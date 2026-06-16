import { getAllAuditEvents } from "@/lib/storage";
import { AuditList, type AuditEventView } from "./AuditList";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = await getAllAuditEvents(100);
  const view: AuditEventView[] = events.map((e) => ({
    id: e.id,
    time: e.time,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    actorLabel: e.actor.email || e.actor.type || "system",
    tenant: e.tenant ?? "",
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-warm-white">Audit trail</h1>
        <p className="text-sm text-gray-muted mt-1">
          Every operator action across the portfolio, newest first.
        </p>
      </div>

      <AuditList events={view} />
    </div>
  );
}
