"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { CalendarConnectionPanel } from "./CalendarConnectionPanel";

type Provider = "outlook" | "google";
type Reservation = {
  requestId: string;
  title: string;
  start: string;
  end: string;
  status: "reserved" | "cancelled" | "writing" | "unknown" | "accepted";
  provider?: Provider;
  providerId?: string;
  verification?: "pending" | "verified" | "failed";
  syncOperation?: "create" | "update" | "delete";
  pendingStart?: string;
  pendingEnd?: string;
  syncError?: string;
};

type AvailabilityState = {
  status: "loading" | "ready" | "error";
  busy?: Array<{ start: string; end: string }>;
  observedAt?: string;
  error?: string;
};

type Props = {
  workspaceId: string;
  workId: string;
  revision: number;
  reservations: readonly Reservation[];
  disabled?: boolean;
  /** Allows readback and explicit cleanup after a workspace exit. New and
   * reschedule actions remain governed by `disabled`. */
  recoveryAllowed?: boolean;
  onChanged?: () => void;
};

function localDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function read<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || fallback);
  return body as T;
}

function customerSyncError(message: string): string {
  return /readback|provider (?:reports?|write|accepted)|recovery|unresolved/i.test(message)
    ? "We could not confirm the change. Check the calendar before trying again."
    : message;
}

export function ScheduleCalendarControls({ workspaceId, workId, revision, reservations, disabled = false, recoveryAllowed = false, onChanged }: Props) {
  const request = useWorkspaceRequest();
  const [provider, setProvider] = useState<Provider>("outlook");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [change, setChange] = useState<{ requestId: string; start: string; end: string } | null>(null);
  const [availability, setAvailability] = useState<Record<string, AvailabilityState>>({});

  async function sync(input: Record<string, unknown>): Promise<boolean> {
    const requestId = String(input.requestId || "");
    setBusy(requestId); setError("");
    try {
      await read(await request("/api/workspace/calendar-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }), "We could not confirm the change. Check the calendar before trying again.");
      onChanged?.();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not confirm the change. Check the calendar before trying again."); return false; }
    finally { setBusy(""); }
  }

  async function reschedule(event: FormEvent, reservation: Reservation) {
    event.preventDefault();
    if (!change || change.requestId !== reservation.requestId || !reservation.provider) return;
    if (await sync({ action: "reschedule", workId, requestId: reservation.requestId, provider: reservation.provider, expectedRevision: revision, start: new Date(change.start).toISOString(), end: new Date(change.end).toISOString() })) setChange(null);
  }

  async function inspectAvailability(reservation: Reservation) {
    const selectedProvider = reservation.provider || provider;
    setAvailability(current => ({ ...current, [reservation.requestId]: { status: "loading" } }));
    try {
      const params = new URLSearchParams({ workspaceId, provider: selectedProvider, start: reservation.start, end: reservation.end });
      const result = await read<{ busy: Array<{ start: string; end: string }>; observedAt: string }>(await request(`/api/workspace/calendar-availability?${params.toString()}`, { cache: "no-store" }), "Provider availability could not be checked.");
      setAvailability(current => ({ ...current, [reservation.requestId]: { status: "ready", busy: result.busy, observedAt: result.observedAt } }));
    } catch (cause) {
      setAvailability(current => ({ ...current, [reservation.requestId]: { status: "error", error: cause instanceof Error ? cause.message : "Provider availability could not be checked." } }));
    }
  }

  return <section className="space-y-5 border-t border-gray-border pt-5" aria-label="External calendar sync">
    <CalendarConnectionPanel workspaceId={workspaceId} disabled={disabled} onChanged={onChanged} />
    {error ? <div role="alert" className="space-y-2 text-sm text-critical"><p>{customerSyncError(error)}</p></div> : null}
    <div className="space-y-4">
      <div><h2 className="font-display text-xl">Calendar sync</h2><p className="text-sm text-gray-muted">A reservation is held locally first. Availability checks are snapshots, so calendar changes can still conflict. If they do, the reservation stays visible so you can check it.</p></div>
      {reservations.length ? <ul className="space-y-4">{reservations.map(reservation => {
        const pending = busy === reservation.requestId;
        const providerName = reservation.provider === "outlook" ? "Outlook" : reservation.provider === "google" ? "Google Calendar" : "external calendar";
        const availabilityResult = availability[reservation.requestId];
        return <li key={reservation.requestId} className="space-y-2 rounded-xl border border-gray-border p-3 text-sm">
          <div><strong>{reservation.title}</strong><p className="text-gray-muted">{reservation.status === "reserved" ? "Held in this workspace" : reservation.status === "accepted" ? `${providerName} confirmed this reservation${reservation.verification === "verified" ? "." : "; check the calendar to confirm it."}` : reservation.status === "cancelled" ? "Cancelled" : reservation.syncOperation === "delete" ? "Cancellation needs your attention." : "Calendar update needs your attention."}</p></div>
          {reservation.syncError ? <p className="text-critical">{customerSyncError(reservation.syncError)}</p> : null}
          <div className="flex flex-wrap gap-2">
            {reservation.status === "reserved" ? <><SelectInput label="Calendar" options={[{ value: "outlook", label: "Outlook" }, { value: "google", label: "Google Calendar" }]} value={provider} disabled={disabled || pending} onChange={event => setProvider(event.target.value as Provider)} /><Button type="button" disabled={disabled || pending} onClick={() => void sync({ action: "create", workId, requestId: reservation.requestId, provider })}>{pending ? "Syncing…" : "Sync reservation"}</Button></> : null}
            {reservation.status !== "cancelled" ? <Button type="button" variant="secondary" disabled={(disabled && !recoveryAllowed) || pending || availabilityResult?.status === "loading"} onClick={() => void inspectAvailability(reservation)}>{availabilityResult?.status === "loading" ? "Checking availability…" : `Check ${reservation.provider ? providerName : provider === "outlook" ? "Outlook" : "Google Calendar"} availability`}</Button> : null}
            {(reservation.status === "unknown" || reservation.status === "writing") && reservation.provider ? <Button type="button" variant="secondary" disabled={(disabled && !recoveryAllowed) || pending} onClick={() => void sync({ action: "recover", workId, requestId: reservation.requestId, provider: reservation.provider })}>{pending ? "Checking the calendar…" : "Check the calendar"}</Button> : null}
            {(reservation.status === "accepted" || reservation.status === "cancelled") && reservation.verification === "failed" && reservation.provider ? <Button type="button" variant="secondary" disabled={(disabled && !recoveryAllowed) || pending} onClick={() => void sync({ action: "recover", workId, requestId: reservation.requestId, provider: reservation.provider })}>{pending ? "Checking the calendar…" : "Check the calendar"}</Button> : null}
            {reservation.status === "accepted" && reservation.provider ? <><Button type="button" variant="secondary" disabled={disabled || pending} onClick={() => setChange({ requestId: reservation.requestId, start: localDateTime(reservation.start), end: localDateTime(reservation.end) })}>Change synced time</Button><Button type="button" variant="secondary" disabled={(disabled && !recoveryAllowed) || pending} onClick={() => void sync({ action: "cancel", workId, requestId: reservation.requestId, provider: reservation.provider, expectedRevision: revision })}>Cancel synced reservation</Button></> : null}
          </div>
          {availabilityResult?.status === "ready" ? <p className={availabilityResult.busy?.length ? "text-critical" : "text-gray-muted"} role="status">{availabilityResult.busy?.length ? `${providerName} shows ${availabilityResult.busy.length} busy event${availabilityResult.busy.length === 1 ? "" : "s"} in this window. Review the conflict before syncing.` : `${providerName} shows no busy events in this window.`} {availabilityResult.observedAt ? `Observed ${new Date(availabilityResult.observedAt).toLocaleString()}.` : ""}</p> : null}
          {availabilityResult?.status === "error" ? <p className="text-critical" role="alert">{availabilityResult.error}</p> : null}
          {change?.requestId === reservation.requestId && reservation.provider ? <form className="space-y-3 rounded-xl bg-surface-muted p-3" onSubmit={event => void reschedule(event, reservation)}><h3 className="font-medium">Change synced time</h3><div className="grid gap-3 sm:grid-cols-2"><TextInput label="New start" type="datetime-local" value={change.start} required disabled={disabled || pending} onChange={event => setChange(current => current ? { ...current, start: event.target.value } : current)} /><TextInput label="New end" type="datetime-local" value={change.end} required disabled={disabled || pending} onChange={event => setChange(current => current ? { ...current, end: event.target.value } : current)} /></div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={disabled || pending || !change.start || !change.end}>Save new synced time</Button><Button type="button" variant="secondary" disabled={pending} onClick={() => setChange(null)}>Keep current time</Button></div></form> : null}
        </li>;
      })}</ul> : <p className="text-sm text-gray-muted">No reservations need calendar sync yet.</p>}
    </div>
  </section>;
}
