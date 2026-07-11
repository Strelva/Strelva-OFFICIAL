"use client";

import { useMemo, useState } from "react";

export interface AuditEventView {
  id: string;
  time: string;
  action: string;
  targetType: string;
  targetId?: string;
  actorLabel: string;
  tenant: string;
}

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
  create: "text-positive",
  add: "text-positive",
  provision: "text-positive",
  update: "text-accent",
  refresh: "text-accent",
  assign_user: "text-accent",
  revoke: "text-critical",
  reject: "text-critical",
  remove: "text-critical",
};

function actionTint(action: string): string {
  const verb = action.split(".").pop() ?? action;
  return ACTION_COLOR[verb] ?? "text-warm-white";
}

const selectCls =
  "rounded-md bg-gray-bg border border-glass-border px-2.5 py-1.5 text-xs text-warm-white focus:outline-none focus:border-accent/50";

export function AuditList({ events }: { events: AuditEventView[] }) {
  const [tenant, setTenant] = useState("");
  const [verb, setVerb] = useState("");
  const [actor, setActor] = useState("");

  const tenants = useMemo(
    () => Array.from(new Set(events.map((e) => e.tenant).filter(Boolean))).sort(),
    [events]
  );
  const verbs = useMemo(
    () => Array.from(new Set(events.map((e) => e.action.split(".").pop() ?? e.action))).sort(),
    [events]
  );
  const actors = useMemo(
    () => Array.from(new Set(events.map((e) => e.actorLabel).filter(Boolean))).sort(),
    [events]
  );

  const filtered = events.filter(
    (e) =>
      (!tenant || e.tenant === tenant) &&
      (!verb || (e.action.split(".").pop() ?? e.action) === verb) &&
      (!actor || e.actorLabel === actor)
  );

  const hasFilter = tenant || verb || actor;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={tenant} onChange={(e) => setTenant(e.target.value)} className={selectCls} aria-label="Filter by tenant">
          <option value="">All tenants</option>
          {tenants.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={verb} onChange={(e) => setVerb(e.target.value)} className={selectCls} aria-label="Filter by action">
          <option value="">All actions</option>
          {verbs.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select value={actor} onChange={(e) => setActor(e.target.value)} className={selectCls} aria-label="Filter by actor">
          <option value="">All actors</option>
          {actors.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {hasFilter && (
          <button
            onClick={() => { setTenant(""); setVerb(""); setActor(""); }}
            className="text-xs text-gray-muted hover:text-warm-white"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-faint">
          {filtered.length} of {events.length}
        </span>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-muted">
            {events.length === 0 ? "No audited actions yet." : "No actions match these filters."}
          </p>
        ) : (
          <ul className="divide-y divide-glass-border">
            {filtered.map((e) => (
              <li key={e.id} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className={`font-medium ${actionTint(e.action)}`}>{e.action}</span>
                    <span className="text-gray-muted"> · {e.targetType}</span>
                    {e.targetId && <span className="text-gray-faint"> {e.targetId}</span>}
                  </p>
                  <p className="text-xs text-gray-muted mt-0.5">
                    {e.actorLabel}
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
