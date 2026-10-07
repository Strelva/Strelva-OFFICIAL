"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";
import type { InquiryBookingOffer } from "@/products/inquiries";

/** Prepares signed choices; the existing exact-message reply approval sends them. */
export function InquiryBookingOfferComposer({ workspaceId, rowId, disabled, append }: { workspaceId: string; rowId: string; disabled: boolean; append: (text: string) => boolean }) {
  const [offer, setOffer] = useState<InquiryBookingOffer | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function prepare(serviceId?: string, starts?: string[]) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/workspace/inquiries/booking-offer", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, rowId, ...(serviceId ? { serviceId } : {}), ...(starts ? { starts } : {}) }) });
      const result = await response.json() as { offer?: InquiryBookingOffer | null; error?: string };
      if (!response.ok) throw new Error(result.error ?? "These times couldn't be prepared. Your reply is still here.");
      if (!result.offer?.slots.length) { setOffer(null); setError("No appointment times are available. You can still reply to this inquiry."); return; }
      if (starts) {
        const origin = window.location.origin;
        const text = `You can request ${result.offer.serviceName} at one of these times. We must confirm your appointment:\n${result.offer.slots.map(slot => `${slot.label}: ${new URL(slot.chooseUrl, origin).href}`).join("\n")}`;
        if (!append(text)) throw new Error("This reply is too long to add appointment times. Shorten it first.");
        setAdded(true);
      } else { setOffer(result.offer); setSelected(result.offer.slots.map(slot => slot.start)); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "These times couldn't be prepared. Your reply is still here."); }
    finally { setBusy(false); }
  }
  const locked = disabled || busy || added;
  return <section className="grid gap-3 rounded-xl border border-gray-border p-4" aria-label="Appointment times for this inquiry">
    {!offer ? <Button variant="secondary" disabled={locked} loading={busy} onClick={() => void prepare()}>Prepare appointment times</Button> : <>
      <SelectInput label="Appointment service" value={offer.serviceId} options={offer.services.map(service => ({ value: service.id, label: service.name }))} disabled={locked} onChange={event => void prepare(event.target.value)} />
      <fieldset disabled={locked} className="grid gap-2"><legend className="mb-2 text-sm">Choose the times to offer</legend>{offer.slots.map(slot => <label key={slot.start} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(slot.start)} onChange={event => setSelected(value => event.target.checked ? [...value, slot.start] : value.filter(start => start !== slot.start))} />{slot.label}</label>)}</fieldset>
      <Button variant="secondary" disabled={locked || selected.length === 0} loading={busy} onClick={() => void prepare(offer.serviceId, selected)}>{added ? "Times added to your reply" : "Add these times to reply"}</Button>
    </>}
    <p className="text-xs text-gray-muted">Preparing times sends nothing. Review the complete reply before approving it. An appointment request still needs the business&apos;s confirmation.</p>
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
  </section>;
}
