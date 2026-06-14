import { getAllAuditEvents } from "@/lib/storage";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTION_COLOR: Record<string, string> = {
  create: "text-emerald-300",
  provision: "text-emerald-300",
  update: "text-accent",
  assign_user: "text-accent",
  revoke: "text-red-300",
  reject: "text-red-300",
};

function actionTint(action: string): string {
  const verb = action.split(".").pop() ?? action;
  return ACTION_COLOR[verb] ?? "text-warm-white";
}

export default async function AuditPage() {
  const events = await getAllAuditEvents(100);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-warm-white">Audit trail</h1>
        <p className="text-sm text-gray-muted mt-1">
          Every operator action across the portfolio, newest first.
        </p>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
        {events.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-muted">No audited actions yet.</p>
        ) : (
          <ul className="divide-y divide-glass-border">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className={`font-medium ${actionTint(e.action)}`}>{e.action}</span>
                    <span className="text-gray-muted"> · {e.targetType}</span>
                    {e.targetId && <span className="text-gray-faint"> {e.targetId}</span>}
                  </p>
                  <p className="text-xs text-gray-muted mt-0.5">
                    {e.actor.email || e.actor.type || "system"}
                    {e.tenant ? ` · ${e.tenant}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-faint" title={e.time}>
                  {timeAgo(e.time)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
