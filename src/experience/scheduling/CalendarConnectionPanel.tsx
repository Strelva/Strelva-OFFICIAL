"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { StPill, StSurface } from "@/components/ui/strelva/Kit";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { calendarProviderConsentActionSchema, type CalendarProviderConsentAction, type CalendarConnection, type CalendarProvider, type CalendarReminderPolicy } from "@/products/scheduling/contracts";
import type { ProviderCalendar } from "@/products/scheduling/server";

type ConnectionResponse = { connections: CalendarConnection[]; setup?: Partial<Record<CalendarProvider, boolean>> };

function providerLabel(provider: CalendarProvider): string {
  return provider === "outlook" ? "Microsoft Outlook" : "Google Calendar";
}

function statusLabel(connection: CalendarConnection | undefined): string {
  if (!connection) return "Not connected";
  if (connection.status === "authorized") return "Account connected; choose a calendar";
  if (connection.status === "revoked") return "Disconnected";
  if (connection.status === "error") return "Needs attention";
  return "Connected";
}

async function body<T>(response: Response, fallback: string): Promise<T> {
  const value = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(value?.error || fallback);
  return value as T;
}

export type CalendarConnectionPanelProps = {
  workspaceId: string;
  disabled?: boolean;
  onChanged?: () => void;
};

export function CalendarConnectionPanel({ workspaceId, disabled = false, onChanged }: CalendarConnectionPanelProps) {
  const request = useWorkspaceRequest();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [calendars, setCalendars] = useState<Partial<Record<CalendarProvider, ProviderCalendar[]>>>({});
  const [editing, setEditing] = useState<CalendarProvider | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState<CalendarProvider | null>(null);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState<Partial<Record<CalendarProvider, boolean>>>({});
  const oauthError = useSearchParams()?.get("calendarError") ?? "";
  const [disconnectNotice, setDisconnectNotice] = useState("");
  const [providerConsentAction, setProviderConsentAction] = useState<CalendarProviderConsentAction | null>(null);
  const [draft, setDraft] = useState<{ provider: CalendarProvider; calendarId: string; calendarName: string; timeZone: string; reminderPolicy: CalendarReminderPolicy } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await body<ConnectionResponse>(await request(`/api/workspace/calendar-connections?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }), "Calendar connections could not be loaded.");
      setConnections(result.connections || []);
      setSetup(result.setup ?? {});
      if (result.connections?.some(connection => connection.provider === "outlook" && connection.status !== "revoked")) setProviderConsentAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Calendar connections could not be loaded."); }
    finally { setLoading(false); }
  }, [request, workspaceId]);

  useEffect(() => { void load(); }, [load]);
  // The OAuth callbacks send their outcome back in the URL; nothing else reads it.
  useEffect(() => { if (oauthError) setError(oauthError); }, [oauthError]);

  async function discover(provider: CalendarProvider) {
    setLoadingCalendars(provider); setError("");
    try {
      const result = await body<{ calendars: ProviderCalendar[] }>(await request(`/api/workspace/calendar-connections?workspaceId=${encodeURIComponent(workspaceId)}&provider=${provider}&list=1`, { cache: "no-store" }), "Calendars could not be listed.");
      setCalendars(current => ({ ...current, [provider]: result.calendars }));
      const editable = result.calendars.filter(item => item.canEdit !== false);
      const connection = connections.find(item => item.provider === provider);
      setDraft({ provider, calendarId: connection?.calendarId && connection.calendarId !== "pending" && editable.some(item => item.id === connection.calendarId) ? connection.calendarId : editable[0]?.id || "", calendarName: connection?.calendarName && connection.calendarId !== "pending" && editable.some(item => item.id === connection.calendarId) ? connection.calendarName : editable[0]?.name || "", timeZone: connection?.timeZone || editable[0]?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", reminderPolicy: connection?.reminderPolicy || { mode: "off" } });
      setEditing(provider);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Calendars could not be listed."); }
    finally { setLoadingCalendars(null); }
  }

  async function configure(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setLoading(true); setError("");
    try {
      const result = await body<{ connection: CalendarConnection }>(await request("/api/workspace/calendar-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "configure", workspaceId, connection: draft }) }), "Calendar settings could not be saved.");
      setConnections(current => [...current.filter(item => item.provider !== draft.provider), result.connection]);
      setEditing(null); setDraft(null); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Calendar settings could not be saved."); }
    finally { setLoading(false); }
  }

  async function disconnect(provider: CalendarProvider) {
    setLoading(true); setError("");
    try {
      const result = await body<{ disconnected: boolean; revocationOutcome?: string; providerConsentAction?: unknown }>(await request("/api/workspace/calendar-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect", workspaceId, provider }) }), "Calendar could not be disconnected.");
      if (provider === "outlook") {
        const action = calendarProviderConsentActionSchema.safeParse(result.providerConsentAction);
        setProviderConsentAction(result.disconnected && action.success ? action.data : null);
      }
      setDisconnectNotice(provider === "google" && (result.revocationOutcome === "failed" || result.revocationOutcome === "partial_failure")
        ? "Google could not confirm access revocation. The calendar is disconnected here and its stored credentials were removed."
        : "");
      await load(); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Calendar could not be disconnected."); }
    finally { setLoading(false); }
  }

  return <section className="space-y-5 border-t border-gray-border pt-5" aria-busy={loading}>
    <div><h2 className="font-display text-xl">Calendar connections</h2><p className="text-sm text-gray-muted">Choose one calendar for this workspace. Reminders follow the connected calendar; Strelva does not send separate reminders.</p></div>
    {error ? <div className="space-y-2 text-sm text-critical" role="alert"><p>{error}</p><StPill type="button" variant="soft" disabled={loading} onClick={() => void load()}>Reload calendar connections</StPill></div> : null}
    {disconnectNotice ? <p className="text-sm text-gray-muted" role="status">{disconnectNotice}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">
      {(["outlook", "google"] as const).map(provider => {
        const connection = connections.find(item => item.provider === provider);
        const options = (calendars[provider] || []).filter(item => item.canEdit !== false);
        const notSetUp = setup[provider] === false && !connection;
        return <article key={provider} className="space-y-3 border-t border-gray-border py-4">
          <div><h3 className="font-medium">{providerLabel(provider)}</h3><p className="text-sm text-gray-muted">{notSetUp ? "Not set up yet" : statusLabel(connection)}</p></div>
          {connection?.status === "connected" ? <dl className="space-y-1 text-sm"><div><dt className="inline text-gray-muted">Calendar: </dt><dd className="inline">{connection.calendarName}</dd></div><div><dt className="inline text-gray-muted">Timezone: </dt><dd className="inline">{connection.timeZone}</dd></div><div><dt className="inline text-gray-muted">Reminders: </dt><dd className="inline">{connection.reminderPolicy.mode === "off" ? "Off" : connection.reminderPolicy.mode === "provider_default" ? "Provider default" : `${connection.reminderPolicy.minutes} minutes before`}</dd></div></dl> : null}
          {notSetUp ? <p className="text-sm text-gray-muted">Strelva hasn’t set up {providerLabel(provider)} yet.</p> : null}
          {connection?.lastError ? <p className="text-sm text-critical">{connection.lastError}</p> : null}
          {provider === "outlook" && providerConsentAction ? <div role="status" className="space-y-2 text-sm leading-6 text-gray-muted"><p>{providerConsentAction.message}</p><a className="inline-flex min-h-11 items-center text-warm-black underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text" href={providerConsentAction.href} target="_blank" rel="noopener noreferrer">{providerConsentAction.label}<span className="sr-only"> (opens in a new tab)</span></a></div> : null}
          <div className="flex flex-wrap gap-2">
            {connection?.status === "connected" || connection?.status === "authorized" || connection?.status === "error" ? <StPill type="button" variant="soft" disabled={disabled || loadingCalendars === provider} onClick={() => void discover(provider)}>{loadingCalendars === provider ? "Finding calendars…" : "Choose calendar"}</StPill> : <StPill type="button" variant="soft" disabled={disabled || notSetUp} onClick={() => window.location.assign(new URL(`/api/workspace/calendar-connections/oauth/${provider}?workspaceId=${encodeURIComponent(workspaceId)}`, window.location.origin).toString())}>Connect {providerLabel(provider)}</StPill>}
            {connection && connection.status !== "revoked" ? <StPill type="button" variant="soft" disabled={disabled || loading} onClick={() => void disconnect(provider)}>Disconnect</StPill> : null}
          </div>
          {editing === provider && draft ? <StSurface label="Calendar settings"><form className="space-y-3" onSubmit={event => void configure(event)}><h4 className="font-medium">Calendar settings</h4>{options.length ? <SelectInput label="Calendar" options={[{ value: "", label: "Choose a calendar" }, ...options.map(item => ({ value: item.id, label: item.name }))]} value={draft.calendarId} required onChange={event => { const chosen = options.find(item => item.id === event.target.value); setDraft(current => current ? { ...current, calendarId: event.target.value, calendarName: chosen?.name || current.calendarName, timeZone: chosen?.timeZone || current.timeZone } : current); }} /> : <p className="text-sm text-gray-muted">No writable calendars were returned. Choose a calendar where this workspace can create and change events.</p>}<TextInput label="Timezone" value={draft.timeZone} required maxLength={128} onChange={event => setDraft(current => current ? { ...current, timeZone: event.target.value } : current)} /><SelectInput label="Reminder policy" options={[{ value: "off", label: "Off" }, { value: "provider_default", label: "Provider default" }, { value: "provider_minutes", label: "30 minutes before" }]} value={draft.reminderPolicy.mode} onChange={event => setDraft(current => current ? { ...current, reminderPolicy: event.target.value === "provider_minutes" ? { mode: "provider_minutes", minutes: 30 } : { mode: event.target.value as "off" | "provider_default" } } : current)} /><div className="flex flex-wrap gap-2"><StPill type="submit" disabled={disabled || loading || !draft.calendarId}>Save calendar settings</StPill><StPill type="button" variant="soft" disabled={loading} onClick={() => { setEditing(null); setDraft(null); }}>Cancel</StPill></div></form></StSurface> : null}
        </article>;
      })}
    </div>
  </section>;
}
