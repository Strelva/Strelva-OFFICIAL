"use client";

import { useCallback, useEffect, useState } from "react";
import { StSection, StRows, StRow, StSegmented, StNotice, StEmpty, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { LADDER_ROUTES } from "@/platform/needs-you/contracts";
import type { ConfigurableKind, LadderRoute } from "@/platform/needs-you/contracts";
import { OPERATOR_ONLY_KIND_LIST, ROUTE_WORDS } from "@/platform/needs-you/policy-words";
import type { PolicyKindView, PolicyView } from "@/platform/needs-you/policy-model";
import { useWorkspaceRequest } from "./WorkspaceRequest";

type State =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error"; message: string }
  | { status: "ready"; role: "owner" | "admin" | "member"; view: PolicyView };

type Change =
  | { action: "set"; kind: ConfigurableKind; systemId: null; route: LadderRoute; expectedVersion: number }
  | { action: "reset"; kind: ConfigurableKind; systemId: null; expectedVersion: number }
  | { action: "undo"; kind: ConfigurableKind; systemId: null; historyId: string; expectedVersion: number };

const GROUPS: { title: string; kinds: ConfigurableKind[] }[] = [
  { title: "Google and reviews", kinds: ["review.reply", "review.reply_critical", "google.post", "google.photo"] },
  { title: "Your website", kinds: ["copy.routine", "copy.marketing", "structure", "fact.owner_stated"] },
  { title: "Customers", kinds: ["customer.message", "customer.commitment", "customer.broadcast"] },
  { title: "Live changes and work", kinds: ["system.go_live", "system.change_live", "system.pause", "running.approve", "request.scope"] },
];

const HIDDEN = new Set<ConfigurableKind>(OPERATOR_ONLY_KIND_LIST);

function errorText(body: unknown, fallback: string): string {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return typeof error === "string" && error.trim() ? error : fallback;
}

function isView(body: unknown): body is { role: "owner" | "admin" | "member"; view: PolicyView } {
  if (!body || typeof body !== "object") return false;
  const value = body as { role?: unknown; view?: { kinds?: unknown } };
  return (value.role === "owner" || value.role === "admin" || value.role === "member") && Array.isArray(value.view?.kinds);
}

/**
 * Who decides, per kind of change, for one business (needs-you spec 3.3).
 * The owner can make a kind stricter, set it back to Strelva's default, or
 * undo their last change. Admins and members see the settings; agencies get
 * nothing. Gone entirely while Needs you is off.
 */
export function DecisionPolicySettings({ workspaceId }: { workspaceId: string }) {
  const transport = useWorkspaceRequest();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<ConfigurableKind | null>(null);
  const [notice, setNotice] = useState<{ kind: ConfigurableKind; tone: "done" | "error"; text: string } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    transport(`/api/workspace/needs-you/policy?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (abort.signal.aborted) return;
      if (!response.ok || !isView(body)) { setState({ status: "error", message: errorText(body, "Who decides could not be loaded. Nothing about it changed.") }); return; }
      setState({ status: "ready", role: body.role, view: body.view });
    }).catch(() => {
      if (!abort.signal.aborted) setState({ status: "error", message: "Who decides could not be loaded. Nothing about it changed." });
    });
    return () => abort.abort();
  }, [workspaceId, transport, attempt]);

  const change = useCallback(async (item: PolicyKindView, next: Change, done: string) => {
    if (pending) return;
    setPending(item.kind);
    setNotice(null);
    try {
      const response = await transport("/api/workspace/needs-you/policy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, change: next }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isView(body)) {
        setNotice({ kind: item.kind, tone: "error", text: errorText(body, "That didn't save. Nothing changed.") });
        if (response.status === 409) setAttempt(value => value + 1);
        return;
      }
      setState({ status: "ready", role: body.role, view: body.view });
      setNotice({ kind: item.kind, tone: "done", text: done });
    } catch {
      setNotice({ kind: item.kind, tone: "error", text: "That didn't save. Nothing changed." });
    } finally {
      setPending(null);
    }
  }, [pending, transport, workspaceId]);

  return <DecisionPolicyPanel state={state} pending={pending} notice={notice} onChange={change} onRetry={() => { setState({ status: "loading" }); setAttempt(value => value + 1); }} />;
}

export type DecisionPolicyState = State;
export type DecisionPolicyChange = Change;

/** The settings as rendered for a given state. Pure, so every state is testable. */
export function DecisionPolicyPanel({ state, pending, notice, onChange, onRetry, showHeading = true }: {
  state: State;
  pending: ConfigurableKind | null;
  notice: { kind: ConfigurableKind; tone: "done" | "error"; text: string } | null;
  onChange: (item: PolicyKindView, change: Change, done: string) => void;
  onRetry: () => void;
  /** Embedded settings need a heading; the standalone page already owns it. */
  showHeading?: boolean;
}) {
  if (state.status === "disabled") return null;

  const content = <>
    <p className="text-sm text-gray-muted">You can always ask to see more before it happens. Dimmed choices are looser than Strelva allows for that kind.</p>
    {state.status === "loading" ? <><p role="status" className="text-sm text-gray-muted">Checking who decides…</p><StSkeleton /><StSkeleton width="70%" /></> : null}
    {state.status === "error" ? <StNotice tone="critical" action={<StTextButton onClick={onRetry}>Check again</StTextButton>}>{state.message}</StNotice> : null}
    {state.status === "ready" ? <>
      {state.role !== "owner" ? <StNotice>Only the owner can change these. You can see how each kind of change is decided.</StNotice> : null}
      {GROUPS.map(group => {
        const rows = group.kinds.flatMap(kind => state.view.kinds.filter(item => item.kind === kind && !HIDDEN.has(item.kind)));
        return rows.length ? <StSection key={group.title} title={group.title}><StRows>{rows.map(item => <PolicyRow key={item.kind} item={item} canChange={state.role === "owner"} busy={pending === item.kind} locked={Boolean(pending)} notice={notice?.kind === item.kind ? notice : null} onChange={onChange} />)}</StRows></StSection> : null;
      })}
      {!state.view.kinds.length ? <StEmpty>No decision settings have been recorded.</StEmpty> : null}
      <StSection title="Always yours"><p className="text-sm text-gray-muted">No setting changes these. Access, money and leaving need you signed in.</p><StRows>{state.view.kinds.filter(item => item.fixed).map(item => <StRow key={item.kind} title={item.label} detail={item.example} end="Ask me first" />)}</StRows></StSection>
    </> : null}
  </>;
  return showHeading ? <StSection id="who-decides" title="Who decides" meta="Only stricter than Strelva's default">{content}</StSection> : <div className="flex min-w-0 flex-col gap-3">{content}</div>;
}

function PolicyRow({ item, canChange, busy, locked, notice, onChange }: {
  item: PolicyKindView;
  canChange: boolean;
  busy: boolean;
  locked: boolean;
  notice: { tone: "done" | "error"; text: string } | null;
  onChange: (item: PolicyKindView, change: Change, done: string) => void;
}) {
  const strelva = ROUTE_WORDS[item.strelvaRoute].label;
  const options = LADDER_ROUTES.map(route => ({ value: route, label: route === "owner_decides" ? "Ask me first" : ROUTE_WORDS[route].label }));
  return <StRow title={item.label} detail={<>{item.example}{!canChange || item.ownerChoices.length < 2 ? <span className="block">{ROUTE_WORDS[item.route].label}. {ROUTE_WORDS[item.route].detail}</span> : null}{item.ownerRoute ? <span className="block">{canChange ? "Your setting." : "The owner's setting."} Strelva&apos;s default is “{strelva}”.</span> : null}{notice ? <span role="status" className="block">{notice.text}</span> : null}</>} end={<div className="grid gap-2">
    <StSegmented label={`Who decides: ${item.label}`} value={item.route} options={options} disabledValues={LADDER_ROUTES.filter(route => !item.ownerChoices.includes(route))} disabledReason="Looser than Strelva allows for this kind. You can only choose its default or stricter." onChange={canChange && !locked ? route => {
      if (route === item.route || !item.ownerChoices.includes(route)) return;
      if (route === item.ownerChoices[0] && item.ownerRoute) onChange(item, { action: "reset", kind: item.kind, systemId: null, expectedVersion: item.ownerVersion }, `Back to Strelva's default: ${ROUTE_WORDS[route].label.toLowerCase()}.`);
      else onChange(item, { action: "set", kind: item.kind, systemId: null, route, expectedVersion: item.ownerVersion }, `Saved: ${ROUTE_WORDS[route].label.toLowerCase()}.`);
    } : undefined} />
    {canChange && (item.ownerRoute || item.ownerUndo) ? <div className="flex flex-wrap gap-4">
      {item.ownerRoute ? <StTextButton disabled={locked} aria-busy={busy || undefined} onClick={() => onChange(item, { action: "reset", kind: item.kind, systemId: null, expectedVersion: item.ownerVersion }, "Back to Strelva's default.")}>Back to default</StTextButton> : null}
      {item.ownerUndo ? <StTextButton disabled={locked} onClick={() => onChange(item, { action: "undo", kind: item.kind, systemId: null, historyId: item.ownerUndo!.historyId, expectedVersion: item.ownerVersion }, "Undone.")} aria-label={`Undo your last change to ${item.label}`}>Undo</StTextButton> : null}
    </div> : null}
  </div>} />;
}
