"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";
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
      if (response.status === 503 && !isView(body)) { setState({ status: "disabled" }); return; }
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
export function DecisionPolicyPanel({ state, pending, notice, onChange, onRetry }: {
  state: State;
  pending: ConfigurableKind | null;
  notice: { kind: ConfigurableKind; tone: "done" | "error"; text: string } | null;
  onChange: (item: PolicyKindView, change: Change, done: string) => void;
  onRetry: () => void;
}) {
  if (state.status === "disabled") return null;

  return <section id="who-decides" className="border-b border-gray-border py-8" aria-labelledby="who-decides-heading">
    <h2 id="who-decides-heading" className="flex items-center gap-2 text-base font-medium text-warm-black"><ShieldCheck className="h-5 w-5 text-accent-text" strokeWidth={1.5} aria-hidden="true" />Who decides</h2>
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">For each kind of change, whether Strelva just does it, a Strelva person checks it, or it waits for you. Strelva sets the starting point. You can make any of them stricter, and set them back.</p>
    {state.status === "loading" ? <p role="status" className="mt-5 text-sm text-gray-muted">Checking who decides…</p> : null}
    {state.status === "error" ? <div role="status" className="mt-5 flex flex-wrap items-center gap-3 text-sm text-gray-muted">{state.message}<Button size="sm" variant="secondary" onClick={onRetry}>Check again</Button></div> : null}
    {state.status === "ready" ? <>
      {state.role !== "owner" ? <p className="mt-4 max-w-2xl text-sm text-gray-muted">Only the owner can change these. You can see how each kind of change is decided.</p> : null}
      {GROUPS.map(group => {
        const rows = group.kinds.flatMap(kind => state.view.kinds.filter(item => item.kind === kind && !HIDDEN.has(item.kind)));
        if (!rows.length) return null;
        const groupId = `who-decides-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return <section key={group.title} className="mt-6" aria-labelledby={groupId}>
          <h3 id={groupId} className="text-sm font-medium text-warm-black">{group.title}</h3>
          <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">
            {rows.map(item => <PolicyRow key={item.kind} item={item} canChange={state.role === "owner"} busy={pending === item.kind} locked={Boolean(pending)}
              notice={notice?.kind === item.kind ? notice : null} onChange={onChange} />)}
          </ul>
        </section>;
      })}
      <section className="mt-6" aria-labelledby="who-decides-always">
        <h3 id="who-decides-always" className="text-sm font-medium text-warm-black">Always yours</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-muted">No setting changes these. Access, money and leaving need you signed in.</p>
        <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">
          {state.view.kinds.filter(item => item.fixed).map(item => <li key={item.kind} className="px-2 py-3">
            <strong className="block text-sm font-medium text-warm-black">{item.label}</strong>
            <small className="mt-1 block text-xs leading-relaxed text-gray-muted">{item.example}</small>
          </li>)}
        </ul>
      </section>
    </> : null}
  </section>;
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
  const options = item.ownerChoices.map(route => ({ value: route, label: route === item.ownerChoices[0] ? `${ROUTE_WORDS[route].label} (Strelva's default)` : ROUTE_WORDS[route].label }));
  return <li className="grid gap-3 px-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] sm:items-start">
    <div className="min-w-0">
      <strong className="block text-sm font-medium text-warm-black">{item.label}</strong>
      <small className="mt-1 block text-xs leading-relaxed text-gray-muted">{item.example}</small>
      {!canChange || item.ownerChoices.length < 2 ? <small className="mt-1 block text-xs leading-relaxed text-warm-black">{ROUTE_WORDS[item.route].label}. {ROUTE_WORDS[item.route].detail}</small> : null}
      {item.ownerRoute ? <small className="mt-1 block text-xs leading-relaxed text-gray-muted">Your setting. Strelva&apos;s default is &ldquo;{strelva}&rdquo;.</small> : null}
      {notice ? <small role="status" className={`mt-1 block text-xs leading-relaxed ${notice.tone === "error" ? "text-critical" : "text-accent-text"}`}>{notice.text}</small> : null}
    </div>
    {canChange && item.ownerChoices.length > 1 ? <div className="grid gap-2">
      <SelectInput
        label={`Who decides: ${item.label}`}
        value={item.route}
        options={options}
        disabled={locked}
        aria-busy={busy || undefined}
        onChange={event => {
          const route = event.target.value as LadderRoute;
          if (route === item.route) return;
          if (route === item.ownerChoices[0] && item.ownerRoute) onChange(item, { action: "reset", kind: item.kind, systemId: null, expectedVersion: item.ownerVersion }, `Back to Strelva's default: ${ROUTE_WORDS[route].label.toLowerCase()}.`);
          else onChange(item, { action: "set", kind: item.kind, systemId: null, route, expectedVersion: item.ownerVersion }, `Saved: ${ROUTE_WORDS[route].label.toLowerCase()}.`);
        }}
      />
      {item.ownerRoute || item.ownerUndo ? <div className="flex flex-wrap gap-2">
        {item.ownerRoute ? <Button size="sm" variant="ghost" disabled={locked} loading={busy} onClick={() => onChange(item, { action: "reset", kind: item.kind, systemId: null, expectedVersion: item.ownerVersion }, "Back to Strelva's default.")}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />Back to default
        </Button> : null}
        {item.ownerUndo ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => onChange(item, { action: "undo", kind: item.kind, systemId: null, historyId: item.ownerUndo!.historyId, expectedVersion: item.ownerVersion }, "Undone.")}
          aria-label={`Undo your last change to ${item.label}`}>
          <Undo2 className="h-4 w-4" aria-hidden="true" />Undo
        </Button> : null}
      </div> : null}
    </div> : null}
  </li>;
}
