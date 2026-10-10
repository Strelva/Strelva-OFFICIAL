"use client";

import { StCopy, StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
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
  return <StRow align="start" kind={`${item.workspaceName} · ${item.source === "standing_run" ? "ongoing run" : "finite work"}`}
    title={<span id={`exception-${item.workId}-${item.stepId || "work"}`}>{item.title}</span>}
    detail={<><StMono>{item.workspaceId} · work {item.workId} · {formatAge(item.ageAt)}</StMono><span className="block">{certaintyLabel(item.effect)}</span><span className="block">Owner: {item.owner.email || item.owner.userId}</span><span className="block">Responsible: {item.responsible?.email || item.responsible?.userId || "Owner"}</span>{item.reason ? <span className="block">{item.reason}</span> : null}<span className="block">Safe action: {item.safeAction}</span></>}
    end={<div className="flex flex-wrap items-center gap-4"><StState kind="down">{statusLabel(item.stepStatus || item.status)}</StState><StTextButton href={item.deepLink}>Open exact exception →</StTextButton></div>} />;
}

function AssignmentCard({ item }: { item: Assignment }) {
  const kind = item.assigneeKind === "agent" ? "Strelva" : item.assigneeKind;
  return <StRow align="start" kind={`${item.workspaceName} · ${kind} assignment`} title={item.title}
    detail={<><span>From {item.sponsorEmail} · expires <StMono>{new Date(item.expiresAt).toLocaleString()}</StMono></span>{item.providerRequest ? <span className="block">Agency request waiting for explicit acceptance.</span> : null}<span className="block">Acceptance and scope are checked again on open.</span></>}
    end={<div className="flex flex-wrap items-center gap-4"><StState kind={item.status === "accepted" ? "live" : "need"}>{item.status}</StState><StTextButton href={item.deepLink}>Open exact assignment →</StTextButton></div>} />;
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
  if (error) return <StNotice tone="critical" action={<StPill variant="soft" onClick={() => setRetry(value => value + 1)}>Check again</StPill>}><span role="alert">{error}</span></StNotice>;
  if (mode === "assigned") return <StSection title="Assigned work">{assignments.length ? <StRows>{assignments.map(item => <AssignmentCard key={item.assignmentId} item={item} />)}</StRows> : <StEmpty>No pending assignments or agency requests are addressed to this verified account.</StEmpty>}</StSection>;
  return <div className="space-y-6">
    <StSection title="Execution exceptions" meta={<StMono>{exceptions.length}</StMono>}>
      {exceptions.length ? <StRows>{exceptions.map(item => <FailureCard key={item.id} item={item} />)}</StRows> : <StEmpty>No durable failed or uncertain execution is waiting for review.</StEmpty>}
    </StSection>
    <StSection title="Your exact assignments" meta={<StMono>{assignments.length}</StMono>}>
      <StCopy muted>Pending work is discovered by verified identity. Opening a row preserves explicit acceptance, expiry, withdrawal, and scope checks.</StCopy>
      {assignments.length ? <StRows>{assignments.map(item => <AssignmentCard key={item.assignmentId} item={item} />)}</StRows> : <StEmpty>No pending assignments or agency requests are addressed to this account.</StEmpty>}
    </StSection>
  </div>;
}
