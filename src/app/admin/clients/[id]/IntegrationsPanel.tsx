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
  const [confirming, setConfirming] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/admin/tenants/${tenantId}/connections`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.connections) setConnections(data.connections);
        else setError("Failed to load connections.");
      })
      .catch(() => setError("Failed to load connections."));
  }, [tenantId]);

  async function handleDisconnect(provider: string) {
    if (confirming !== provider) {
      setConfirming(provider);
      return;
    }
    setConfirming(null);
    setDisconnecting(provider);
    setDisconnectError((e) => ({ ...e, [provider]: "" }));
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/connections`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Disconnect failed.");
      if (data?.connections) setConnections(data.connections);
    } catch (err) {
      setDisconnectError((e) => ({
        ...e,
        [provider]: err instanceof Error ? err.message : "Disconnect failed.",
      }));
    } finally {
      setDisconnecting(null);
    }
  }

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
            const isConfirming = confirming === c.provider;
            const isDisconnecting = disconnecting === c.provider;
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
                  {disconnectError[c.provider] && (
                    <p className="mt-1 text-[11px] text-critical">
                      {disconnectError[c.provider]}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleDisconnect(c.provider)}
                  disabled={isDisconnecting}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    isConfirming
                      ? "border-critical/40 bg-critical/10 text-critical hover:bg-critical/20"
                      : "border-glass-border text-gray-muted hover:border-gray-border hover:text-warm-white"
                  }`}
                >
                  {isDisconnecting
                    ? "Removing…"
                    : isConfirming
                    ? "Confirm remove"
                    : "Disconnect"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-gray-faint">
        Removing a connection deletes the stored token. The client can reconnect via their Settings.
      </p>
    </div>
  );
}
