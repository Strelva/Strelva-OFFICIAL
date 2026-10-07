"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { proposalOptionsSchema, type InquiryProposalOptions, type InquiryProposalDelivery } from "@/products/bookings/contracts";

type Phase = "idle" | "loading" | "ready" | "sending" | "permission" | "error" | InquiryProposalDelivery;
type BookingProposalRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export interface ProposeBookingTimesProps {
  workspaceId: string; tenantId: string; inquiryId: string; customerName: string;
  request?: BookingProposalRequest;
  /** Read-only preview hydration; live inboxes always begin idle. */
  initial?: { phase: Phase; options?: InquiryProposalOptions; selected?: string[]; error?: string };
}

/** One owner-approved reply: choose real open times, inspect the recipient and send once. */
export function ProposeBookingTimes({ workspaceId, tenantId, inquiryId, customerName, request = fetch, initial }: ProposeBookingTimesProps) {
  const labelId = useId();
  const [phase, setPhase] = useState<Phase>(initial?.phase ?? "idle");
  const [options, setOptions] = useState<InquiryProposalOptions | null>(initial?.options ?? null);
  const [selected, setSelected] = useState<string[]>(initial?.selected ?? []);
  const [visible, setVisible] = useState(12);
  const [error, setError] = useState(initial?.error ?? "");
  const busy = phase === "loading" || phase === "sending";
  const complete = phase === "accepted" || phase === "suppressed" || phase === "unavailable";
  function slotLabel(start: string) {
    return new Intl.DateTimeFormat("en-US", { timeZone: options?.timeZone ?? "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(start));
  }
  async function load(serviceId?: string) {
    setPhase("loading"); setError(""); setSelected([]); setVisible(12);
    try {
      const params = new URLSearchParams({ workspaceId, tenantId, inquiryId, ...(serviceId ? { serviceId } : {}) });
      const response = await request(`/api/workspace/bookings/propose-times?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) { setPhase("permission"); return; }
      if (!response.ok) throw new Error(body?.error ?? "Open times couldn't be read. Try again.");
      const parsed = proposalOptionsSchema.safeParse(body);
      if (!parsed.success) throw new Error("Open times couldn't be verified. Try again.");
      setOptions(parsed.data); setPhase("ready");
    } catch (cause) { setPhase("error"); setError(cause instanceof Error ? cause.message : "Open times couldn't be read. Try again."); }
  }
  async function send() {
    if (!options?.serviceId || selected.length < 1 || selected.length > 3 || busy) return;
    setPhase("sending"); setError("");
    try {
      const response = await request("/api/workspace/bookings/propose-times", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, tenantId, inquiryId, serviceId: options.serviceId, starts: selected, expectedCustomerEmail: options.customer.email }) });
      const body = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) { setPhase("permission"); return; }
      if (!response.ok) throw new Error(body?.error ?? "The suggestions couldn't be prepared. Reload open times before trying again.");
      if (!["accepted", "suppressed", "unavailable"].includes(body?.delivery)) throw new Error("Email delivery couldn't be confirmed. Check the inquiry before trying again.");
      setPhase(body.delivery);
    } catch (cause) { setPhase("error"); setError(cause instanceof Error ? cause.message : "Email delivery couldn't be confirmed. Check the inquiry before trying again."); }
  }
  if (phase === "idle") return <div className="mt-3"><Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={() => void load()}>Propose booking times</Button></div>;
  return <section className="mt-5 border-t border-gray-border pt-4" aria-labelledby={labelId}>
    <h4 id={labelId} className="break-words text-sm font-medium">Propose times for {customerName}</h4>
    <p className="mt-1 text-sm leading-6 text-gray-muted">Choose up to three open times. They choose one to request it; the business confirms the booking.</p>
    {phase === "loading" ? <p role="status" className="mt-3 text-sm text-gray-muted">Reading current services and open times…</p> : null}
    {phase === "permission" ? <p role="alert" className="mt-3 text-sm text-critical">Sign in as this business&apos;s owner or an admin to propose times.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-critical">{error}</p> : null}
    {complete ? <div className="mt-3 text-sm leading-6" role="status">
      <p>{phase === "accepted" ? "The email provider accepted these suggestions. Customer delivery is not yet verified." : phase === "suppressed" ? "The suggestions are prepared. Email is disabled, so the customer has not been notified." : "The suggestions are prepared, but email delivery could not be confirmed. Check the inquiry before trying again."}</p>
      <ul className="mt-2 text-gray-muted">{selected.map((start) => <li key={start}>{slotLabel(start)}</li>)}</ul>
    </div> : options && phase !== "permission" ? <>
      {options.paused ? <p className="mt-3 text-sm text-gray-muted">Bookings are paused. Existing bookings stay kept; new times cannot be proposed.</p> : options.services.length === 0 ? <p className="mt-3 text-sm text-gray-muted">No request-mode booking service is available. Ask Strelva to set one up.</p> : <>
        <label className="mt-4 block text-sm font-medium">Service
          <select className="mt-1 block min-h-11 w-full rounded-md border border-gray-border bg-canvas px-3 text-sm" value={options.serviceId ?? ""} disabled={busy} onChange={(event) => void load(event.target.value)}>
            {options.services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}
          </select>
        </label>
        {options.slots.length === 0 ? <p className="mt-3 text-sm text-gray-muted">No open times are available in the next 60 days.</p> : <fieldset className="mt-4" disabled={busy}>
          <legend className="text-sm font-medium">Open times · {options.timeZone}</legend>
          <p id={`${labelId}-limit`} className="mt-1 text-sm text-gray-muted">{selected.length} of 3 selected. Availability is checked again before the suggestions are prepared.</p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">{options.slots.slice(0, visible).map((slot) => (
            <label key={slot.start} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-gray-border px-3 py-2 text-sm">
              <input type="checkbox" className="size-4 shrink-0 accent-warm-black" checked={selected.includes(slot.start)} disabled={!selected.includes(slot.start) && selected.length >= 3}
                aria-describedby={`${labelId}-limit`} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, slot.start] : previous.filter((start) => start !== slot.start))} />
              <span>{slotLabel(slot.start)}</span>
            </label>
          ))}</div>
          {visible < options.slots.length ? <Button className="mt-2 max-sm:min-h-11" size="sm" variant="ghost" onClick={() => setVisible((count) => count + 12)}>Show more open times</Button> : null}
        </fieldset>}
        {selected.length ? <div className="mt-4 rounded-md border border-gray-border p-3 text-sm leading-6">
          <p className="break-words font-medium">Reply to {options.customer.name} · {options.customer.email}</p>
          <p className="mt-1 text-gray-muted">The business suggested these times. Choose one to request it. The business will confirm your request.</p>
          <ul className="mt-2">{selected.map((start) => <li key={start}>{slotLabel(start)}</li>)}</ul>
          <Button className="mt-3 max-sm:min-h-11" size="sm" loading={phase === "sending"} disabled={busy} onClick={() => void send()}>Send suggested times</Button>
        </div> : null}
      </>}
    </> : null}
    {(phase === "error" || phase === "ready") && !busy && !complete ? <Button className="mt-3 max-sm:min-h-11" size="sm" variant="ghost" onClick={() => void load(options?.serviceId ?? undefined)}>Reload open times</Button> : null}
  </section>;
}
