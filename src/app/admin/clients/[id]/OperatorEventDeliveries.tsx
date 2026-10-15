"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StLabel } from "@/components/ui/strelva/Kit";
import {
  APP_EVENT_LABELS,
  appEventDeliveriesViewSchema,
  parseSubscriberKey,
  type AppEventDeliveriesView,
} from "@/platform/app-events/contracts";
import { BUILT_IN_APPS } from "@/platform/app-releases/catalog";

type State = { kind: "loading" } | { kind: "off" } | { kind: "unlinked" } | { kind: "error" } | { kind: "ready"; view: AppEventDeliveriesView };

const UNLINKED = "This client has no linked business, so events don't apply.";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return "this address"; } };

/** What Apps and webhooks received for one client, what could not be delivered, and a way to try again. Nothing renders while events are off. */
export function OperatorEventDeliveries({ tenantId, request = fetch }: { tenantId: string; request?: typeof fetch }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/admin/tenants/${encodeURIComponent(tenantId)}/app-events`;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await request(endpoint, { credentials: "same-origin" });
        if (!live) return;
        if (response.status === 503) { setState({ kind: "off" }); return; }
        if (response.status === 404) { setState({ kind: "unlinked" }); return; }
        const parsed = response.ok ? appEventDeliveriesViewSchema.safeParse(await response.json()) : null;
        setState(parsed?.success ? { kind: "ready", view: parsed.data } : { kind: "error" });
      } catch { if (live) setState({ kind: "error" }); }
    })();
    return () => { live = false; };
  }, [endpoint, request, attempt]);

  const retry = useCallback(async (deadLetterId: string) => {
    setBusy(true); setMessage(null);
    try {
      const response = await request(endpoint, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry", deadLetterId }),
      });
      if (!response.ok) {
        const value = await response.json().catch(() => null);
        setMessage((value && typeof value.error === "string" && value.error) || "That did not go through. Nothing changed.");
        return;
      }
      setMessage("Queued. It runs within 5 minutes.");
      setAttempt((value) => value + 1);
    } catch { setMessage("That did not go through. Nothing changed."); }
    finally { setBusy(false); }
  }, [endpoint, request]);

  if (state.kind === "loading" || state.kind === "off") return null;
  if (state.kind === "unlinked") return <p className="text-xs text-gray-muted">{UNLINKED}</p>;
  if (state.kind === "error") return <p role="alert" className="text-sm text-critical">Events could not be read. Nothing changed.</p>;
  const { view } = state;
  const endpointById = new Map(view.endpoints.map((item) => [item.id, item]));
  const who = (subscriber: string) => {
    const key = parseSubscriberKey(subscriber);
    if (key?.kind === "app") return BUILT_IN_APPS.find((app) => app.id === key.appId)?.name ?? "An App";
    if (key?.kind === "webhook") { const item = endpointById.get(key.endpointId); return item ? hostOf(item.url) : "A webhook"; }
    return "An App";
  };
  const week = view.counts.reduce((sum, row) => sum + row.count, 0);

  return <section aria-label="Operator event deliveries" className="grid gap-3">
    <StLabel>Events Apps receive</StLabel>
    {!view.captureOn
      ? <p className="text-sm">Events aren&apos;t being recorded for any business yet.</p>
      : <p className="text-sm">{view.stream.lastSequence} recorded · {week} this week{view.stream.lastEventAt ? ` · last ${when(view.stream.lastEventAt)}` : ""}</p>}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {view.lanes.length ? <ul className="grid gap-1 text-sm">
      {view.lanes.map((lane) => <li key={lane.subscriber}>
        {who(lane.subscriber)} · through #{lane.deliveredThrough}{lane.behind > 0 ? ` · ${lane.behind} behind` : " · up to date"}
        {lane.attempts > 0 ? ` · ${lane.attempts} ${lane.attempts === 1 ? "try" : "tries"}, next ${when(lane.nextAttemptAt)}` : ""}{lane.lastError ? ` · ${lane.lastError}` : ""}
      </li>)}
    </ul> : null}
    {view.deadLetters.length ? <div className="grid gap-1">
      <h4 className="text-xs text-gray-muted">Not delivered</h4>
      <ul className="grid gap-2 text-sm">
        {view.deadLetters.map((letter) => <li key={letter.id} className="flex flex-wrap items-center gap-2">
          <span>{APP_EVENT_LABELS[letter.type]} #{letter.sequence} · {who(letter.subscriber)} · {when(letter.deadAt)}{letter.lastError ? ` · ${letter.lastError}` : ""}</span>
          {letter.replayOutcome === "delivered"
            ? <span className="text-gray-muted">Delivered</span>
            : letter.replayRequestedAt && !letter.replayedAt
              ? <span className="text-gray-muted">Queued</span>
              : <Button variant="secondary" size="sm" disabled={busy} onClick={() => retry(letter.id)}>Try again</Button>}
        </li>)}
      </ul>
    </div> : <p className="text-sm text-gray-muted">Every event was delivered.</p>}
    {view.endpoints.length ? <div className="grid gap-1">
      <h4 className="text-xs text-gray-muted">Webhooks</h4>
      <ul className="grid gap-1 text-sm">
        {view.endpoints.map((item) => <li key={item.id}>
          {hostOf(item.url)} · {item.eventTypes.map((type) => APP_EVENT_LABELS[type]).join(", ")} · {item.status === "active" ? "Receiving events" : item.status === "paused" ? "Paused" : "Turned off"} · Secret ends in {item.secretHint}{item.agencyName ? ` · added by ${item.agencyName}` : " · added by the business"}
        </li>)}
      </ul>
    </div> : null}
  </section>;
}
