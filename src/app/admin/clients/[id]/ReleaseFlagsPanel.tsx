"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip, Panel } from "@/app/admin/console";
import type { TenantReleaseState } from "@/platform/owner-entry/operator";

/**
 * Per-workspace release flags for one converted client (owner-entry spec §3.7).
 * Every change needs a reason. `On` also needs Jacob's yes, and owner entry
 * can go `on` only once every page this client uses has moved; until then
 * `Operators` sends only Strelva operators and named testers to the workspace.
 */

type FlagState = "unset" | "off" | "operators" | "on";
const STATES: { value: FlagState; label: string }[] = [
  { value: "unset", label: "Follow env" },
  { value: "off", label: "Off" },
  { value: "operators", label: "Operators" },
  { value: "on", label: "On" },
];
const labelCls = "text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-faint";
const inputCls = "w-full rounded-lg border border-glass-border bg-surface-base/40 px-3 py-2 text-[13px] text-warm-white placeholder:text-gray-faint focus:border-accent focus:outline-none";

function envLabel(mode: string): string {
  return mode === "on" ? "1 (on everywhere)" : mode === "workspace" ? "workspace (per client)" : "off (kill switch)";
}

export function ReleaseFlagsPanel({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<TenantReleaseState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [jacobApproved, setJacobApproved] = useState(false);
  const [testerEmail, setTesterEmail] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/release-flags`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setState(data as TenantReleaseState);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't read the release flags.");
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function send(body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/release-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setState(data as TenantReleaseState);
      setReason("");
      setJacobApproved(false);
      setTesterEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Panel title="Release flags">
        <p className="text-[13px] text-critical" role="alert">{loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-3 text-[12px] font-medium text-accent hover:underline">Try again</button>
      </Panel>
    );
  }
  if (!state) {
    return <Panel title="Release flags"><p className="text-[13px] text-gray-muted" aria-busy="true">Loading release flags…</p></Panel>;
  }
  if (!state.linked) {
    return (
      <Panel title="Release flags">
        <p className="text-[13px] leading-relaxed text-gray-muted">
          This client isn&apos;t converted to a business workspace yet, so it has no per-client flags. It follows the env flags and lands on /dashboard.
        </p>
      </Panel>
    );
  }

  const reasonOk = reason.trim().length >= 3;
  return (
    <Panel title="Release flags" trailing={<Chip tone={state.workspaceRelease ? "good" : "neutral"}>{state.workspaceRelease ? "Workspace release on" : "Workspace release off"}</Chip>}>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor={`release-reason-${tenantId}`} className={labelCls}>Reason for the next change</label>
          <input id={`release-reason-${tenantId}`} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Walk every gldf page before the owner invite" maxLength={480} />
          <label className="flex items-center gap-2 text-[12px] text-gray-muted">
            <input type="checkbox" checked={jacobApproved} onChange={(e) => setJacobApproved(e.target.checked)} />
            Jacob said yes (needed to turn a client on)
          </label>
        </div>

        <ul className="space-y-4">
          {state.flags.map((flag) => {
            const current: FlagState = flag.row ?? "unset";
            return (
              <li key={flag.flag} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-warm-white">{flag.label}</p>
                  <Chip tone={flag.effective === "on" ? "good" : flag.effective === "operators" ? "warn" : "neutral"}>
                    {flag.effective === "on" ? "On for this client" : flag.effective === "operators" ? "Operators and testers" : "Off for this client"}
                  </Chip>
                </div>
                <div className="inline-flex flex-wrap rounded-lg border border-glass-border bg-surface-base/40 p-0.5" role="group" aria-label={`${flag.label} for this client`}>
                  {STATES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={current === option.value}
                      disabled={busy || current === option.value || !reasonOk || (option.value === "on" && !jacobApproved)}
                      onClick={() => void send({ kind: "flag", flag: flag.flag, state: option.value, reason, expectedRevision: flag.revision, jacobApproved })}
                      className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed ${current === option.value ? "bg-accent text-on-accent" : "text-gray-muted hover:text-warm-white disabled:opacity-40"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-faint">{flag.envName} = {envLabel(flag.envMode)}</p>
              </li>
            );
          })}
        </ul>

        {state.ownerEntryBlockers.length > 0 && (
          <div className="space-y-1.5">
            <p className={labelCls}>Pages keeping owner entry from going on</p>
            <ul className="space-y-1 text-[12px] text-gray-muted">
              {state.ownerEntryBlockers.map((page) => (
                <li key={page.route}><span className="font-mono text-warm-white">/dashboard{page.route === "/" ? "" : page.route}</span> → {page.home}. {page.note}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1.5">
          <p className={labelCls}>Named testers</p>
          {state.testerEmails.length === 0 ? (
            <p className="text-[12px] text-gray-muted">None. Operators state reaches super admins only.</p>
          ) : (
            <ul className="space-y-1">
              {state.testerEmails.map((email) => (
                <li key={email} className="flex items-center justify-between gap-2 text-[12px] text-warm-white">
                  <span>{email}</span>
                  <button type="button" disabled={busy || !reasonOk} onClick={() => void send({ kind: "tester", email, present: false, reason })} className="text-gray-muted hover:text-critical disabled:opacity-40">Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <label htmlFor={`release-tester-${tenantId}`} className="sr-only">Tester email</label>
            <input id={`release-tester-${tenantId}`} className={inputCls} type="email" value={testerEmail} onChange={(e) => setTesterEmail(e.target.value)} placeholder="tester@example.com" />
            <button type="button" disabled={busy || !reasonOk || !testerEmail.includes("@")} onClick={() => void send({ kind: "tester", email: testerEmail, present: true, reason })} className="shrink-0 rounded-lg border border-glass-border px-3 text-[12px] font-medium text-warm-white hover:border-accent disabled:opacity-40">Add</button>
          </div>
        </div>

        {error && <p className="text-[12px] text-critical" role="alert">{error}</p>}
        {!reasonOk && <p className="text-[11px] text-gray-faint">Write a reason to enable changes.</p>}

        {state.history.length > 0 && (
          <div className="space-y-1.5">
            <p className={labelCls}>Recent changes</p>
            <ul className="space-y-1 text-[12px] text-gray-muted">
              {state.history.map((change) => (
                <li key={change.id}>
                  <span className="text-warm-white">{change.subject === "tester" ? `Tester ${change.testerEmail ?? ""}` : change.subject}</span>{" "}
                  {change.fromState} → {change.toState} · {change.reason} · {change.changedBy} · {new Date(change.changedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
