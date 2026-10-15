"use client";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { StNotice } from "@/components/ui/strelva/Kit";
import {
  APP_EVENT_LABELS,
  APP_EVENT_TYPES,
  appEventDeliveriesViewSchema,
  parseSubscriberKey,
  type AppEventDeliveriesView,
  type AppEventEndpointView,
  type AppEventType,
} from "@/platform/app-events/contracts";
import { BUILT_IN_APPS } from "@/platform/app-releases/catalog";

const responseSchema = appEventDeliveriesViewSchema.extend({ webhooksOn: z.boolean() });
type Loaded = AppEventDeliveriesView & { webhooksOn: boolean };
type State = { kind: "loading" } | { kind: "off" } | { kind: "error" } | { kind: "ready"; data: Loaded };

/** Shown once, right after a webhook is added or its secret is renewed. */
interface NewSecret { host: string; secret: string }

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return "this address"; } };

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}
function soon(iso: string, now: number): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
  if (minutes <= 1) return "within a minute";
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `in ${hours} ${hours === 1 ? "hour" : "hours"}` : `in ${Math.round(hours / 24)} days`;
}

const STATUS_WORDS: Record<AppEventEndpointView["status"], string> = { active: "Receiving events", paused: "Paused", disabled: "Turned off" };

/**
 * Events Apps receive for one client: whether events are recorded, what is waiting to be
 * retried or could not be delivered (with Try again), and, where Webhooks are on, the
 * outside addresses that receive signed events. Renders nothing while events are off
 * (the route answers 503).
 */
export function AgencyClientEvents({ agencyWorkspaceId, workspaceId, clientName, request = fetch }: { agencyWorkspaceId: string; workspaceId: string; clientName: string; request?: typeof fetch }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [queued, setQueued] = useState<string | null>(null);
  const [secret, setSecret] = useState<NewSecret | null>(null);
  const [turningOff, setTurningOff] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [types, setTypes] = useState<readonly AppEventType[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/app-events?${new URLSearchParams({ workspaceId, agencyWorkspaceId })}`, { credentials: "same-origin" });
        if (!live) return;
        if (response.status === 503) { setState({ kind: "off" }); return; }
        const parsed = response.ok ? responseSchema.safeParse(await response.json()) : null;
        setState(parsed?.success && parsed.data.workspaceId === workspaceId ? { kind: "ready", data: parsed.data } : { kind: "error" });
      } catch { if (live) setState({ kind: "error" }); }
    })();
    return () => { live = false; };
  }, [agencyWorkspaceId, workspaceId, request, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  if (state.kind === "off") return null;
  if (state.kind === "loading") return <p role="status" className="mx-2 mb-4 text-sm text-gray-muted">Checking events…</p>;
  if (state.kind === "error") {
    return <div className="mx-2 mb-4"><StNotice tone="critical">Events for {clientName} could not be read. Nothing changed.</StNotice>
      <Button variant="secondary" size="sm" onClick={() => { setState({ kind: "loading" }); reload(); }}>Retry</Button></div>;
  }
  const { data } = state;
  const now = Date.now();
  const canChange = data.viewer.canChange;
  const endpointById = new Map(data.endpoints.map((endpoint) => [endpoint.id, endpoint]));

  const who = (subscriber: string): string => {
    const key = parseSubscriberKey(subscriber);
    if (key?.kind === "app") return BUILT_IN_APPS.find((app) => app.id === key.appId)?.name ?? "An App";
    if (key?.kind === "webhook") { const endpoint = endpointById.get(key.endpointId); return endpoint ? hostOf(endpoint.url) : "A webhook"; }
    return "An App";
  };

  async function send(body: Record<string, unknown>): Promise<{ ok: boolean; value: unknown; error: string | null }> {
    setBusy(true);
    try {
      const response = await request("/api/workspace/app-events", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId, agencyWorkspaceId }),
      });
      const value = await response.json().catch(() => null);
      const error = response.ok ? null : (value && typeof value.error === "string" && value.error) || "That did not go through. Nothing changed.";
      return { ok: response.ok, value, error };
    } catch {
      return { ok: false, value: null, error: "That did not go through. Nothing changed." };
    } finally { setBusy(false); }
  }

  async function retry(deadLetterId: string) {
    setNotice(null);
    const result = await send({ action: "retry", deadLetterId });
    if (!result.ok) { setNotice(result.error); return; }
    setQueued(deadLetterId);
    reload();
  }
  async function setStatus(endpoint: AppEventEndpointView, status: "active" | "paused" | "disabled") {
    setNotice(null); setTurningOff(null);
    const result = await send({ action: "set_webhook", endpointId: endpoint.id, status });
    if (!result.ok) { setNotice(result.error); return; }
    reload();
  }
  async function renew(endpoint: AppEventEndpointView) {
    setNotice(null);
    const result = await send({ action: "rotate_webhook_secret", endpointId: endpoint.id });
    const issued = result.value && typeof (result.value as { secret?: unknown }).secret === "string" ? (result.value as { secret: string }).secret : null;
    if (!result.ok || !issued) { setNotice(result.error ?? "That did not go through. Nothing changed."); return; }
    setSecret({ host: hostOf(endpoint.url), secret: issued });
    reload();
  }
  async function add() {
    setNotice(null);
    const result = await send({ action: "create_webhook", url: url.trim(), eventTypes: types });
    const issued = result.value && typeof (result.value as { secret?: unknown }).secret === "string" ? (result.value as { secret: string }).secret : null;
    if (!result.ok || !issued) { setNotice(result.error ?? "That did not go through. Nothing changed."); return; }
    setSecret({ host: hostOf(url.trim()), secret: issued });
    setUrl(""); setTypes([]);
    reload();
  }

  const week = data.counts.reduce((sum, row) => sum + row.count, 0);
  const waiting = data.lanes.filter((lane) => lane.attempts > 0);
  const failed = data.deadLetters;
  // Pausing and turning off work even with the Webhooks switch off, so existing addresses stay visible then.
  const showWebhooks = data.webhooksOn || data.endpoints.length > 0;
  const formReady = /^https:\/\//i.test(url.trim()) && types.length > 0;

  return <section aria-label="Events Apps receive" className="mx-2 mb-4 grid gap-3">
    <h3 className="text-sm font-medium">Events Apps receive</h3>
    {!data.captureOn
      ? <StNotice>Events aren&apos;t being recorded for any business yet.</StNotice>
      : <p className="text-sm">Last event {ago(data.stream.lastEventAt, now)} · {week} this week</p>}
    {notice ? <StNotice tone="critical">{notice}</StNotice> : null}

    {waiting.length ? <div className="grid gap-1">
      <h4 className="text-xs text-gray-muted">Waiting to retry</h4>
      <ul className="grid gap-1 text-sm">
        {waiting.map((lane) => <li key={lane.subscriber}>{who(lane.subscriber)} · {lane.attempts} {lane.attempts === 1 ? "try" : "tries"} · next {soon(lane.nextAttemptAt, now)}{lane.lastError ? ` · ${lane.lastError}` : ""}</li>)}
      </ul>
    </div> : null}

    {failed.length ? <div className="grid gap-1">
      <h4 className="text-xs text-gray-muted">Not delivered</h4>
      <ul className="grid gap-2 text-sm">
        {failed.map((letter) => <li key={letter.id} className="flex flex-wrap items-center gap-2">
          <span>{APP_EVENT_LABELS[letter.type]} #{letter.sequence} · {who(letter.subscriber)} · {ago(letter.deadAt, now)}</span>
          {canChange && letter.replayOutcome !== "delivered" && queued !== letter.id
            ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => retry(letter.id)}>Try again</Button> : null}
          {queued === letter.id || (letter.replayRequestedAt && !letter.replayedAt) ? <span className="text-gray-muted">Queued. It runs within 5 minutes.</span> : null}
          {letter.replayOutcome === "delivered" ? <span className="text-gray-muted">Delivered</span> : null}
        </li>)}
      </ul>
    </div> : null}

    {!waiting.length && !failed.length ? <p className="text-sm text-gray-muted">Every event was delivered.</p> : null}

    {showWebhooks ? <div className="grid gap-3">
      <h4 className="text-xs text-gray-muted">Webhooks</h4>
      {secret ? <div className="grid gap-1" role="status">
        <p className="text-sm">New secret for {secret.host}</p>
        <code className="block break-all rounded-xl bg-surface-inset px-3 py-2 text-sm">{secret.secret}</code>
        <p className="text-xs text-gray-muted">Copy this now. It won&apos;t be shown again.</p>
        <div><Button variant="secondary" size="sm" onClick={() => setSecret(null)}>I&apos;ve copied it</Button></div>
      </div> : null}
      {data.endpoints.length ? <ul className="grid gap-3 text-sm">
        {data.endpoints.map((endpoint) => <li key={endpoint.id} className="grid gap-1">
          <span>{hostOf(endpoint.url)} · {endpoint.eventTypes.map((type) => APP_EVENT_LABELS[type]).join(", ")}</span>
          <span className="text-xs text-gray-muted">{STATUS_WORDS[endpoint.status]} · Secret ends in {endpoint.secretHint}</span>
          {canChange && endpoint.status !== "disabled" ? <div className="flex flex-wrap items-center gap-2">
            {endpoint.status === "active"
              ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus(endpoint, "paused")}>Pause</Button>
              : data.webhooksOn ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus(endpoint, "active")}>Resume</Button> : null}
            {data.webhooksOn ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => renew(endpoint)}>New secret</Button> : null}
            {turningOff === endpoint.id
              ? <>
                <span className="text-xs">Turned off webhooks can&apos;t be turned back on.</span>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => setStatus(endpoint, "disabled")}>Turn off</Button>
                <Button variant="ghost" size="sm" onClick={() => setTurningOff(null)}>Keep it</Button>
              </>
              : <Button variant="ghost" size="sm" disabled={busy} onClick={() => setTurningOff(endpoint.id)}>Turn off</Button>}
          </div> : null}
        </li>)}
      </ul> : null}
      {canChange && data.webhooksOn ? <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); if (formReady && !busy) void add(); }}>
        <h4 className="text-xs text-gray-muted">Add a webhook</h4>
        <TextInput label="Address (https)" type="url" inputMode="url" autoComplete="off" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
        <fieldset className="grid gap-1">
          <legend className="text-xs text-gray-muted">Events</legend>
          {APP_EVENT_TYPES.map((type) => <label key={type} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={types.includes(type)} onChange={(event) => setTypes((current) => event.target.checked ? [...current, type] : current.filter((item) => item !== type))} />
            {APP_EVENT_LABELS[type]}
          </label>)}
        </fieldset>
        <p className="text-xs text-gray-muted">Strelva signs each delivery with this secret. Events carry ids and states, not customer details.</p>
        <div><Button type="submit" variant="primary" size="sm" disabled={!formReady || busy}>Add webhook</Button></div>
      </form> : null}
    </div> : null}
  </section>;
}
