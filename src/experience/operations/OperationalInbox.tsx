"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type EffectCertainty = "none" | "accepted" | "unknown";
type Exception = {
  id: string;
  source: "responsibility" | "standing_run";
  workspaceId: string;
  workspaceName: string;
  workId: string;
  title: string;
  status: string;
  stepId?: string;
  stepStatus?: string;
  effect: EffectCertainty;
  reason?: string;
  ageAt: string;
  owner: { userId: string; email?: string };
  responsible?: { userId: string; email?: string; kind?: string; assignmentId?: string };
  safeAction: "retry" | "reconcile" | "inspect";
  deepLink: string;
};
type Assignment = {
  assignmentId: string;
  workspaceId: string;
  workspaceName: string;
  workId: string;
  title: string;
  status: "offered" | "accepted";
  assigneeKind: string;
  sponsorEmail: string;
  expiresAt: string;
  providerRequest?: { deliveryId: string; status: "requested"; installationId: string; expiresAt: string };
  deepLink: string;
};

function formatAge(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Age unavailable";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function certaintyLabel(effect: EffectCertainty): string {
  return effect === "none" ? "No effect recorded" : effect === "accepted" ? "Effect accepted; verification needed" : "Effect unknown; do not replay";
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function FailureCard({ item }: { item: Exception }) {
  return <li id={`exception-${item.workId}-${item.stepId || "work"}`} className="rounded-xl border border-glass-border bg-glass p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">{item.workspaceName} · {item.source === "standing_run" ? "ongoing run" : "finite work"}</p>
        <h3 className="mt-1 text-[14px] font-semibold text-warm-white">{item.title}</h3>
        <p className="mt-1 text-[12px] text-gray-muted">{item.workspaceId} · work {item.workId}</p>
      </div>
      <span className="rounded-md bg-critical/12 px-2 py-1 text-[11px] font-semibold capitalize text-critical">{statusLabel(item.stepStatus || item.status)}</span>
    </div>
    <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="text-gray-faint">Age</dt><dd className="mt-1 text-gray-muted">{formatAge(item.ageAt)}</dd></div>
      <div><dt className="text-gray-faint">Effect certainty</dt><dd className="mt-1 text-gray-muted">{certaintyLabel(item.effect)}</dd></div>
      <div><dt className="text-gray-faint">Owner</dt><dd className="mt-1 break-all text-gray-muted">{item.owner.email || item.owner.userId}</dd></div>
      <div><dt className="text-gray-faint">Responsible actor</dt><dd className="mt-1 break-all text-gray-muted">{item.responsible?.email || item.responsible?.userId || "Owner"}</dd></div>
    </dl>
    {item.reason ? <p className="mt-3 rounded-lg border border-glass-border bg-gray-bg px-3 py-2 text-[12px] leading-5 text-gray-muted">{item.reason}</p> : null}
    <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px]">
      <span className="rounded-md bg-warning/12 px-2 py-1 font-medium text-warning">Safe action: {item.safeAction}</span>
      <Link href={item.deepLink} className="font-medium text-accent hover:underline">Open exact exception →</Link>
    </div>
  </li>;
}

function AssignmentCard({ item }: { item: Assignment }) {
  return <li className="rounded-xl border border-glass-border bg-glass p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">{item.workspaceName} · {item.assigneeKind} assignment</p>
        <h3 className="mt-1 text-[14px] font-semibold text-warm-white">{item.title}</h3>
        <p className="mt-1 text-[12px] text-gray-muted">From {item.sponsorEmail} · expires {new Date(item.expiresAt).toLocaleString()}</p>
      </div>
      <span className="rounded-md bg-accent-dim px-2 py-1 text-[11px] font-semibold capitalize text-accent">{item.status}</span>
    </div>
    {item.providerRequest ? <p className="mt-3 rounded-lg border border-accent/20 bg-accent-dim px-3 py-2 text-[12px] text-accent">Provider request waiting for explicit acceptance.</p> : null}
    <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px]">
      <Link href={item.deepLink} className="font-medium text-accent hover:underline">Open exact assignment →</Link>
      <span className="text-gray-faint">Acceptance and scope are checked again on open.</span>
    </div>
  </li>;
}

export function OperationalInbox({ mode }: { mode: "internal" | "assigned" }) {
  return <OperationalInboxContent key={mode} mode={mode} />;
}

function OperationalInboxContent({ mode }: { mode: "internal" | "assigned" }) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    mode: typeof mode;
    retry: number;
    exceptions: Exception[];
    assignments: Assignment[];
    error: string;
  } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const view = mode === "assigned" ? "inbox" : "internal";
    fetch(`/api/operations/inbox?view=${view}`, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { error?: string; exceptions?: Exception[]; inbox?: { assignments?: Assignment[] } };
      if (!response.ok) throw new Error(body.error || "The operational inbox could not be loaded.");
      if (abort.signal.aborted) return;
      setResult({ mode, retry,
        exceptions: Array.isArray(body.exceptions) ? body.exceptions : [],
        assignments: Array.isArray(body.inbox?.assignments) ? body.inbox.assignments : [],
        error: "",
      });
    }).catch((cause) => {
      if (!abort.signal.aborted) setResult({ mode, retry, exceptions: [], assignments: [],
        error: cause instanceof Error ? cause.message : "The operational inbox could not be loaded.",
      });
    });
    return () => abort.abort();
  }, [mode, retry]);

  // A previous mode or retry cannot supply the current request's content or error.
  if (!result || result.mode !== mode || result.retry !== retry) return <p role="status" className="text-sm text-gray-muted">Checking exact work records…</p>;
  const { exceptions, assignments, error } = result;
  if (error) return <section className="rounded-xl border border-warning/25 bg-warning/10 p-4"><p role="alert" className="text-sm text-warm-white">{error}</p><button type="button" className="mt-3 text-sm font-medium text-accent hover:underline" onClick={() => setRetry((value) => value + 1)}>Check again</button></section>;
  if (mode === "assigned") return <section aria-labelledby="assigned-inbox-list" className="space-y-3"><h2 id="assigned-inbox-list" className="sr-only">Assigned work</h2>{assignments.length ? <ul className="space-y-3">{assignments.map((item) => <AssignmentCard key={item.assignmentId} item={item} />)}</ul> : <p className="rounded-xl border border-gray-border p-4 text-sm text-gray-muted">No pending assignments or provider requests are addressed to this verified account.</p>}</section>;
  return <div className="space-y-6">
    <section aria-labelledby="exception-inbox-heading"><div className="flex items-baseline justify-between gap-3"><h2 id="exception-inbox-heading" className="text-[13.5px] font-semibold text-warm-white">Execution exceptions</h2><span className="font-mono text-[11px] text-gray-faint">{exceptions.length}</span></div>{exceptions.length ? <ul className="mt-3 space-y-3">{exceptions.map((item) => <FailureCard key={item.id} item={item} />)}</ul> : <p className="mt-3 rounded-xl border border-gray-border p-4 text-sm text-gray-muted">No durable failed or uncertain execution is waiting for review.</p>}</section>
    <section aria-labelledby="staff-inbox-heading"><div className="flex items-baseline justify-between gap-3"><h2 id="staff-inbox-heading" className="text-[13.5px] font-semibold text-warm-white">Your exact assignments</h2><span className="font-mono text-[11px] text-gray-faint">{assignments.length}</span></div><p className="mt-1 text-[12px] leading-5 text-gray-muted">Pending work is discovered by verified identity. Opening a card preserves explicit acceptance, expiry, withdrawal, and scope checks.</p>{assignments.length ? <ul className="mt-3 space-y-3">{assignments.map((item) => <AssignmentCard key={item.assignmentId} item={item} />)}</ul> : <p className="mt-3 rounded-xl border border-gray-border p-4 text-sm text-gray-muted">No pending assignments or provider requests are addressed to this account.</p>}</section>
  </div>;
}
