"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
type Service = { id: string; name: string; intake?: Array<{ id: string; label: string; type: "text" | "textarea"; required: boolean }> };
type Options = { timeZone: string; paused: boolean; services: Service[]; slots: Array<{ start: string; end: string }> };
export function ManualBookingForm({ workspaceId, tenantId, request = fetch }: { workspaceId: string; tenantId?: string; request?: (url: string, init?: RequestInit) => Promise<Response> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Options | null>(null), [serviceId, setServiceId] = useState(""), [start, setStart] = useState("");
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" }), [answers, setAnswers] = useState<Record<string, string>>({});
  const [requestId, setRequestId] = useState<string | null>(null), [receipt, setReceipt] = useState<string | null>(null);
  function edit() { setRequestId(null); setReceipt(null); }
  async function load(service = "") {
    setBusy(true); setError(null); setStart(""); setOptions(null); setAnswers({}); edit();
    try {
      const query = new URLSearchParams({ workspaceId, ...(tenantId ? {tenantId} : {}), ...(service ? { serviceId: service } : {}) });
      const res = await request(`/api/workspace/bookings/manual?${query}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Open times could not load. Try again.");
      setOptions(body); setServiceId(service);
    } catch (error) { setError(error instanceof Error ? error.message : "Open times could not load. Try again."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const id = requestId ?? crypto.randomUUID(); setRequestId(id);
    try {
      const res = await request("/api/workspace/bookings/manual", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, tenantId, serviceId, start, customer, requestId: id, intakeAnswers: answers }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "This booking could not be confirmed. Check the list before trying again.");
      setReceipt("Booking request saved. The owner decides it in Needs you. Customer notices follow the business's email settings.");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "This booking could not be confirmed. Check the list before trying again."); }
    finally { setBusy(false); }
  }
  const service = options?.services.find(s => s.id === serviceId);
  return <div className="mt-4">
    {!open ? <Button className="max-sm:min-h-11" variant="secondary" size="sm" onClick={() => { setOpen(true); void load(); }}>Take a booking request</Button> : <form className="grid gap-4 rounded-xl border border-gray-border p-4" onSubmit={submit} aria-label="Take a booking request">
      <p className="text-sm leading-6 text-gray-muted">Choose an open time for the customer. The owner confirms the request.</p>
      {busy && !options ? <p role="status" className="text-sm text-gray-muted">Reading open times…</p> : null}
      {options?.paused ? <p role="status" className="text-sm text-gray-muted">Bookings are paused. Existing bookings are kept.</p> : null}
      {options && !options.paused ? <>
        <SelectInput className="max-sm:min-h-11" options={[{value: "", label: "Choose a service"}, ...options.services.map(s => ({value: s.id, label: s.name}))]} label="Service" value={serviceId} disabled={busy || !!receipt} onChange={e => void load(e.target.value)} required />
        {serviceId ? options.slots.length ? <SelectInput className="max-sm:min-h-11" options={[{value: "", label: "Choose a time"}, ...options.slots.map(slot => ({value: slot.start, label: new Intl.DateTimeFormat("en-US", {timeZone: options.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}).format(new Date(slot.start))}))]} label={`Open time (${options.timeZone})`} value={start} required disabled={busy || !!receipt} onChange={e => { edit(); setStart(e.target.value); }} /> : <p role="status" className="text-sm text-gray-muted">No open times in the next two weeks. Choose another service or check again later.</p> : null}
        <TextInput className="max-sm:min-h-11" label="Customer name" autoComplete="name" required maxLength={160} value={customer.name} disabled={busy || !!receipt} onChange={e => { edit(); setCustomer({ ...customer, name: e.target.value }); }} />
        <TextInput className="max-sm:min-h-11" label="Customer email" type="email" autoComplete="email" required maxLength={320} value={customer.email} disabled={busy || !!receipt} onChange={e => { edit(); setCustomer({ ...customer, email: e.target.value }); }} />
        <TextInput className="max-sm:min-h-11" label="Customer phone (optional)" type="tel" autoComplete="tel" maxLength={80} value={customer.phone} disabled={busy || !!receipt} onChange={e => { edit(); setCustomer({ ...customer, phone: e.target.value }); }} />
        {service?.intake?.map(q => { const props = { className: "max-sm:min-h-11", label: q.label, required: q.required, maxLength: 2000, value: answers[q.id] ?? "", disabled: busy || !!receipt, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { edit(); setAnswers({ ...answers, [q.id]: e.target.value }); } }; return q.type === "textarea" ? <TextArea key={q.id} {...props} /> : <TextInput key={q.id} {...props} />; })}
        {!receipt ? <Button className="max-sm:min-h-11" type="submit" size="sm" loading={busy} disabled={busy || !start}>Save booking request</Button> : null}
      </> : null}
      {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
      {receipt ? <p role="status" className="text-sm text-gray-muted">{receipt}</p> : null}
      {error && !options ? <Button className="max-sm:min-h-11" type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void load(serviceId)}>Try loading again</Button> : null}
      <Button className="max-sm:min-h-11" type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Close</Button>
    </form>}
  </div>;
}
