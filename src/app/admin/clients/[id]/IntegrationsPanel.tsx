"use client";

import { useEffect, useState } from "react";

interface SafeConnection {
  provider: string;
  tenantId: string;
  status: "connected" | "disconnected" | "error" | "needs_reauth";
  scopes: string[];
  lastSyncedAt: string | null;
  expiresAt: string | null;
}

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  instagram: "Instagram",
  calendly: "Calendly",
  yelp: "Yelp",
  vegaro: "Vegaro",
};

function statusPill(status: SafeConnection["status"]): {
  label: string;
  cls: string;
} {
  switch (status) {
    case "connected":
      return { label: "Connected", cls: "text-positive bg-positive/10 border-positive/25" };
    case "needs_reauth":
      return { label: "Needs reconnect", cls: "text-warning bg-warning/10 border-warning/25" };
    case "error":
      return { label: "Sync error", cls: "text-critical bg-critical/10 border-critical/25" };
    case "disconnected":
      return { label: "Disconnected", cls: "text-gray-muted bg-glass border-glass-border" };
    default:
      return { label: status, cls: "text-gray-muted bg-glass border-glass-border" };
  }
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

interface Props {
  tenantId: string;
}

export function IntegrationsPanel({ tenantId }: Props) {
  const [connections, setConnections] = useState<SafeConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/tenants/${tenantId}/connections`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.connections) setConnections(data.connections);
        else setError("Failed to load connections.");
      })
      .catch(() => setError("Failed to load connections."));
  }, [tenantId]);

  return (
    <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-4">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">
        Integrations
      </h2>

      {connections === null && !error && (
        <p className="text-sm text-gray-muted">Loading…</p>
      )}

      {error && (
        <p className="text-sm text-critical">{error}</p>
      )}

      {connections !== null && connections.length === 0 && (
        <p className="text-sm text-gray-muted">No integrations connected.</p>
      )}

      {connections !== null && connections.length > 0 && (
        <ul className="space-y-2.5">
          {connections.map((c) => {
            const pill = statusPill(c.status);
            const label = PROVIDER_LABEL[c.provider] ?? c.provider;
            return (
              <li
                key={c.provider}
                className="flex items-center justify-between gap-4 rounded-xl border border-glass-border bg-glass px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-white">{label}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                    {c.lastSyncedAt && (
                      <span className="text-[11px] text-gray-faint">
                        synced {ago(c.lastSyncedAt)}
                      </span>
                    )}
                    {c.status === "needs_reauth" && c.expiresAt && (
                      <span className="text-[11px] text-warning">
                        expired {ago(c.expiresAt)}
                      </span>
                    )}
                  </div>
                  {c.scopes.length > 0 && (
                    <p className="mt-1 text-[11px] text-gray-faint truncate max-w-xs">
                      {c.scopes.join(", ")}
                    </p>
                  )}
                </div>

              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-gray-faint">
        Read-only support metadata. Manage client connections through ordinary business or agency access.
      </p>
    </div>
  );
}
