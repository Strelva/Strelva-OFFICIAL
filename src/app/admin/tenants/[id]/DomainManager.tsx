"use client";

import { useState } from "react";
import { TONE_DOT, TONE_PILL, type Tone } from "@/lib/status-colors";

export interface DomainClaimView {
  domain: string;
  status: string;
  dnsStatus: string;
  sslStatus: string;
  role: string;
  isApex: boolean;
  verification: string[];
  error?: string;
  updatedAt: string;
}

const ROLES = ["production", "admin", "additional"] as const;

function statusTone(status: string): Tone {
  if (status === "verified" || status === "configured" || status === "issued") return "good";
  if (status === "pending") return "warn";
  if (status === "unknown") return "neutral";
  return "bad";
}

export function DomainManager({
  tenantId,
  initialDomains,
}: {
  tenantId: string;
  initialDomains: DomainClaimView[];
}) {
  const [domains, setDomains] = useState<DomainClaimView[]>(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [newRole, setNewRole] = useState<string>("additional");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const base = `/api/admin/tenants/${tenantId}/domains`;

  async function call(action: string, init: RequestInit, url = base) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setDomains(data.domains || []);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (!newDomain.trim()) return;
    const ok = await call("add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain.trim(), role: newRole }),
    });
    if (ok) setNewDomain("");
  }

  return (
    <div className="rounded-xl bg-glass border border-glass-border p-5">
      <h2 className="text-sm font-semibold text-warm-white">Domains</h2>
      <p className="mt-0.5 text-xs text-gray-muted">
        DNS + SSL status per claimed domain. Refresh re-checks verification.
      </p>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mt-4 space-y-2">
        {domains.length === 0 && (
          <p className="text-xs text-gray-faint">No domains claimed yet.</p>
        )}
        {domains.map((d) => (
          <div key={d.domain} className="rounded-lg border border-glass-border bg-surface-base/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs text-warm-white">{d.domain}</span>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${TONE_PILL[d.role === "production" ? "info" : "neutral"]}`}>
                    {d.role}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-muted">
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[statusTone(d.status)]}`} /> {d.status}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[statusTone(d.dnsStatus)]}`} /> DNS {d.dnsStatus}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[statusTone(d.sslStatus)]}`} /> SSL {d.sslStatus}
                  </span>
                </div>
                {d.error && <p className="mt-1 text-[11px] text-red-300/80">{d.error}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => void call(`refresh:${d.domain}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ domain: d.domain }),
                  })}
                  disabled={busy !== null}
                  className="rounded-md border border-glass-border px-2.5 py-1 text-xs text-gray-muted hover:text-warm-white disabled:opacity-40"
                >
                  {busy === `refresh:${d.domain}` ? "…" : "Refresh"}
                </button>
                {confirmingRemove === d.domain ? (
                  <>
                    <button
                      onClick={() => {
                        setConfirmingRemove(null);
                        void call(`remove:${d.domain}`, { method: "DELETE" }, `${base}?domain=${encodeURIComponent(d.domain)}`);
                      }}
                      disabled={busy !== null}
                      className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-40"
                    >
                      {busy === `remove:${d.domain}` ? "…" : "Confirm"}
                    </button>
                    <button onClick={() => setConfirmingRemove(null)} className="rounded-md px-2 py-1 text-xs text-gray-muted hover:text-warm-white">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmingRemove(d.domain)}
                    className="rounded-md border border-red-500/25 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {d.verification.length > 0 && (
              <div className="mt-2 rounded-md bg-surface-inset p-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-faint">Verification records</p>
                {d.verification.map((v, i) => (
                  <p key={i} className="mt-0.5 break-all font-mono text-[11px] text-gray-muted">{v}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-end gap-2 border-t border-glass-border pt-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-muted mb-1">Add domain</label>
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))}
            placeholder="example.com"
            className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          aria-label="Domain role"
          className="rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          onClick={() => void add()}
          disabled={busy !== null || !newDomain.trim()}
          className="rounded-md bg-warm-white text-surface-base px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy === "add" ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
