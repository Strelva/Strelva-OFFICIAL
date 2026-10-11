"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  bookingRequestStorageKey,
  cancelBooking,
  changeBooking,
  clearBookingRequestDraft,
  createBookingRequestId,
  loadBookingSchedule,
  readBookingStatus,
  readBookingRequestDraft,
  reserveBooking,
  PublicBookingConflictError,
  sameBookingRequest,
  writeBookingRequestDraft,
  type PublicBookingRequestDraft,
  type PublicBookingReceipt,
  type PublicBookingRange,
  type PublicBookingSchedule,
  type PublicBookingSlot,
  type PublicBookingVisitor,
} from "./booking-client";

type ConnectedProps = {
  baseUrl: string;
  tenant: string;
  capabilityId: string;
  range: PublicBookingRange;
  expectedVersion?: number;
};

/** Client-site entry point for a published native calendar capability. */
export function StrelvaConnectedBookingForm(props: ConnectedProps) {
  return <BookingLoader key={`${props.baseUrl}:${props.tenant}:${props.capabilityId}:${props.range.from}:${props.range.to}`} {...props} />;
}

function BookingLoader({ baseUrl, tenant, capabilityId, range, expectedVersion }: ConnectedProps) {
  const [result, setResult] = useState<PublicBookingSchedule | Error | null>(null);
  const [receipt, setReceipt] = useState<PublicBookingReceipt | null>(null);
  const requestStorageKey = bookingRequestStorageKey(baseUrl, tenant, capabilityId);
  const [requestDraft] = useState<PublicBookingRequestDraft | null>(() => readBookingRequestDraft(requestStorageKey));
  const rangeFrom = range.from;
  const rangeTo = range.to;
  useEffect(() => {
    const controller = new AbortController();
    void loadBookingSchedule(baseUrl, tenant, capabilityId, { from: rangeFrom, to: rangeTo }, controller.signal).then(
      schedule => { if (!controller.signal.aborted) setResult(schedule); },
      error => { if (!controller.signal.aborted) setResult(error instanceof Error ? error : new Error("Booking availability is unavailable.")); },
    );
    return () => controller.abort();
  }, [baseUrl, tenant, capabilityId, rangeFrom, rangeTo]);
  if (result === null) return <p role="status">Loading booking times…</p>;
  if (result instanceof Error) return <p role="alert">{result.message}</p>;
  if (expectedVersion !== undefined && result.version !== expectedVersion) return <p role="alert">This booking schedule changed. Please contact the business directly.</p>;

  return (
    <StrelvaBookingForm
    schedule={result}
    receipt={receipt}
    initialRequestDraft={requestDraft}
    onReserve={async (slot, visitor) => {
        const current = readBookingRequestDraft(requestStorageKey);
        const requestId = current && current.capabilityId === result.capabilityId && current.capabilityVersion === result.version &&
          sameBookingRequest(current, { slotId: slot.id, capabilityVersion: result.version, visitor })
          ? current.requestId
          : createBookingRequestId();
        writeBookingRequestDraft(requestStorageKey, {
          requestId,
          capabilityId: result.capabilityId,
          capabilityVersion: result.version,
          slotId: slot.id,
          visitor,
        });
        const next = await reserveBooking(baseUrl, tenant, result, slot, visitor, { requestId });
        clearBookingRequestDraft(requestStorageKey);
        setReceipt(next);
        return next;
      }}
      onChange={async (current, slot) => {
        const next = await changeBooking(baseUrl, tenant, current, slot);
        setReceipt(next);
        return next;
      }}
      onCancel={async current => {
        const next = await cancelBooking(baseUrl, tenant, current);
        setReceipt(next);
        return next;
      }}
      onReconcile={async current => {
        const next = await readBookingStatus(baseUrl, tenant, current);
        setReceipt(next);
        return next;
      }}
    />
  );
}

function providerLabel(provider: PublicBookingSchedule["provider"]): string {
  return provider === "outlook" ? "Outlook" : "Google Calendar";
}

/** Fixed renderer used by generated client sites and local representative proofs. */
export function StrelvaBookingForm({
  schedule,
  receipt: initialReceipt = null,
  onReserve,
  onChange,
  onCancel,
  onReconcile,
  initialRequestDraft,
  submitLabel = "Reserve time",
  testOnly = false,
}: {
  schedule: PublicBookingSchedule;
  receipt?: PublicBookingReceipt | null;
  onReserve?: (slot: PublicBookingSlot, visitor: PublicBookingVisitor) => Promise<PublicBookingReceipt>;
  onChange?: (receipt: PublicBookingReceipt, slot: PublicBookingSlot) => Promise<PublicBookingReceipt>;
  onCancel?: (receipt: PublicBookingReceipt) => Promise<PublicBookingReceipt>;
  onReconcile?: (receipt: PublicBookingReceipt) => Promise<PublicBookingReceipt>;
  initialRequestDraft?: PublicBookingRequestDraft | null;
  submitLabel?: string;
  /** Isolated Strelva candidate preview: callbacks must be supplied locally. */
  testOnly?: boolean;
}) {
  const prefix = useId();
  const [pending, setPending] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [receipt, setReceipt] = useState<PublicBookingReceipt | null>(initialReceipt);
  const initialSlotId = initialRequestDraft?.capabilityId === schedule.capabilityId && initialRequestDraft.capabilityVersion === schedule.version && schedule.slots.some(value => value.id === initialRequestDraft.slotId)
    ? initialRequestDraft.slotId
    : schedule.slots[0]?.id ?? "";
  const [slotId, setSlotId] = useState(initialSlotId);
  const [name, setName] = useState(initialRequestDraft?.visitor.name ?? "");
  const [email, setEmail] = useState(initialRequestDraft?.visitor.email ?? "");
  const [phone, setPhone] = useState(initialRequestDraft?.visitor.phone ?? "");
  const native = schedule.bookingAuthority === "business";
  const [visitorTimeZone, setVisitorTimeZone] = useState(schedule.timeZone);
  useEffect(() => { if (native) setVisitorTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone); }, [native]);
  const [intakeAnswers,setIntakeAnswers]=useState<Record<string,string>>(initialRequestDraft?.visitor.intakeAnswers ?? {});
  const [message, setMessage] = useState(initialRequestDraft?.visitor.message ?? "");
  const [alternatives, setAlternatives] = useState<PublicBookingConflictError | null>(null);

  const slots = alternatives?.nextSlots ?? schedule.slots;
  const slot = slots.find(value => value.id === slotId);
  const timeZone = native ? visitorTimeZone : alternatives?.timeZone ?? schedule.timeZone;
  function showConflict(error: unknown) {
    if (error instanceof PublicBookingConflictError) { setAlternatives(error); setSlotId(error.nextSlots[0]?.id ?? ""); }
  }
  const reservationLabel = receipt?.status === "confirmed"
    ? native ? "The business confirmed this booking." : `${providerLabel(schedule.provider)} confirmed this reservation.`
    : receipt?.status === "cancelled"
      ? "This reservation is cancelled."
      : receipt
        ? native ? "If you received a confirmation email, confirm within 15 minutes. Your request is waiting for the business to confirm. This time is not confirmed yet." : "If you received a confirmation email, confirm within 15 minutes. We could not confirm this reservation yet. Check the calendar before trying again."
        : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || !onReserve || pending) return;
    setPending(true);
    setStatus(null);
    try {
      const next = await onReserve(slot, { name, email, ...(native && phone.trim() ? { phone: phone.trim() } : {}), ...(message.trim() ? { message } : {}), ...(schedule.intake ? {intakeAnswers} : {}) });
      setReceipt(next);
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setStatus({ kind: "success", text: testOnly ? "Test booking completed. Nobody was told, no calendar changed, and no real record was kept." : next.status === "confirmed" ? "Your time is reserved." : "Your request was received for confirmation." });
    } catch (error) {
      showConflict(error);
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Your booking was not confirmed. Please try again." });
    } finally { setPending(false); }
  }

  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt || receipt.status === "cancelled" || !slot || !onChange || pending) return;
    setPending(true);
    setStatus(null);
    try {
      const next = await onChange(receipt, slot);
      setReceipt(next);
      setStatus({ kind: "success", text: next.status === "confirmed" ? "Your reservation was changed." : "Your change is awaiting confirmation." });
    } catch (error) {
      showConflict(error);
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Your booking was not changed. Please try again." });
    } finally { setPending(false); }
  }

  async function cancel() {
    if (!receipt || receipt.status === "cancelled" || !onCancel || pending) return;
    setPending(true);
    setStatus(null);
    try {
      const next = await onCancel(receipt);
      setReceipt(next);
      setStatus({ kind: "success", text: "Your reservation was cancelled." });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Your booking was not cancelled. Please try again." });
    } finally { setPending(false); }
  }

  async function reconcile() {
    if (!receipt || !onReconcile || pending || reconciling) return;
    setReconciling(true);
    setStatus(null);
    try {
      const next = await onReconcile(receipt);
      setReceipt(next);
      setStatus({ kind: "success", text: next.status === "confirmed" ? "The reservation is confirmed." : next.status === "cancelled" ? "The reservation is cancelled." : native ? "The business has not confirmed your request yet." : "The reservation is still awaiting confirmation. Check the calendar before trying again." });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "The booking status could not be checked. Please try again." });
    } finally { setReconciling(false); }
  }

  if (testOnly && receipt) return <section aria-label={schedule.name}>
    <h2>{schedule.name}</h2>
    <p role="status">Test booking completed. Nobody was told, no calendar changed, and no real record was kept.</p>
    <button type="button" onClick={() => { setReceipt(null); setStatus(null); }}>Try another test</button>
  </section>;

  if (!schedule.slots.length) {
    return <p role="status">No booking times are available right now. Please contact the business directly.</p>;
  }

  return (
    <section aria-label={schedule.name}>
      <h2>{schedule.name}</h2>
      <p>{testOnly ? "Choose a configured test time. Live availability is checked only after publication; this test goes nowhere." : native ? "Choose a time. The business confirms your booking; a connected calendar receives a copy." : `Choose a time. ${providerLabel(schedule.provider)} will confirm the reservation.`}</p>
      {native && !testOnly ? <p>Times shown in {visitorTimeZone}.</p> : null}
      <form onSubmit={(event) => void submit(event)} aria-label="Reserve a time">
        <label htmlFor={`${prefix}-slot`}>Available time</label>
        <select id={`${prefix}-slot`} value={slotId} disabled={pending} onChange={event => setSlotId(event.target.value)}>
          {slots.map(value => <option key={value.id} value={value.id}>{formatSlot(value, timeZone)}</option>)}
        </select>
        {alternatives ? <p role="status">{slots.length ? "The next available times are shown above. Choose a time and try again." : "No alternative times are available right now. Contact the business directly."}</p> : null}
        <label htmlFor={`${prefix}-name`}>Name</label>
        <input id={`${prefix}-name`} name="name" value={name} required maxLength={160} disabled={pending} onChange={event => setName(event.target.value)} />
        <label htmlFor={`${prefix}-email`}>Email</label>
        <input id={`${prefix}-email`} name="email" type="email" value={email} required maxLength={320} disabled={pending} onChange={event => setEmail(event.target.value)} />
        {schedule.intake?.map(question=><div key={question.id}>
          <label htmlFor={`${prefix}-intake-${question.id}`}>{question.label}{question.required ? "" : " (optional)"}</label>
          {question.type === "textarea" ? <textarea id={`${prefix}-intake-${question.id}`} value={intakeAnswers[question.id] ?? ""} required={question.required} maxLength={2000} disabled={pending} onChange={event=>setIntakeAnswers(current=>({...current,[question.id]:event.target.value}))} />
            : <input id={`${prefix}-intake-${question.id}`} value={intakeAnswers[question.id] ?? ""} required={question.required} maxLength={2000} disabled={pending} onChange={event=>setIntakeAnswers(current=>({...current,[question.id]:event.target.value}))} />}
        </div>)}
        {native ? <><label htmlFor={`${prefix}-phone`}>Phone (optional)</label><input id={`${prefix}-phone`} name="phone" type="tel" value={phone} maxLength={80} disabled={pending} onChange={event => setPhone(event.target.value)} /></> : null}
        <label htmlFor={`${prefix}-message`}>Note (optional)</label>
        <textarea id={`${prefix}-message`} name="message" value={message} maxLength={2000} disabled={pending} onChange={event => setMessage(event.target.value)} />
        <button type="submit" disabled={pending || !onReserve || !slot}>{pending ? "Saving…" : submitLabel}</button>
      </form>
      {receipt ? (
        <section aria-label="Booking receipt">
          <h3>{receipt.title}</h3>
          <p>{formatSlot({ start: receipt.start, end: receipt.end }, native ? visitorTimeZone : receipt.timeZone)}</p>
          <p role="status">{reservationLabel}</p>
          {receipt.status !== "cancelled" ? (
            <>
              {receipt.status === "pending" ? (
                onReconcile ? <button type="button" disabled={pending || reconciling} onClick={() => void reconcile()}>{reconciling ? "Checking…" : native ? "Check request status" : "Check booking status"}</button> : null
              ) : (
                <>
                  <form onSubmit={(event) => void change(event)} aria-label="Change reservation">
                    <button type="submit" disabled={pending || !onChange || !slot}>Change time</button>
                  </form>
                  <button type="button" disabled={pending || !onCancel} onClick={() => void cancel()}>Cancel reservation</button>
                </>
              )}
            </>
          ) : null}
        </section>
      ) : null}
      {status ? <p role={status.kind === "error" ? "alert" : "status"}>{status.text}</p> : null}
    </section>
  );
}

function formatSlot(slot: Pick<PublicBookingSlot, "start" | "end">, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone });
    return `${formatter.format(new Date(slot.start))}–${formatter.format(new Date(slot.end))}`;
  } catch {
    return `${slot.start}–${slot.end}`;
  }
}
