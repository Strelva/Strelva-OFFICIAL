"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { formatMoney } from "@/platform/connect/money-format";
import { governedCollectionReceiptSchema, governedMoneyGraphSchema, sameRecordedMoneyInstant, type GovernedMoneyGraph } from "@/platform/connect/governed-money-contract";

type Command = { action: "accept_collection_terms"; workspaceId: string; lineId: string; priceVersion: string; amountCents: number; currency: string; installationId: string | null; periodStart: string; periodEnd: string };
type Phase = "ready" | "pending" | "loading" | "uncertain" | "blocked";
function message(value: unknown) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "The accepted terms could not be confirmed. Reload to check what was recorded."; }
function matches(value: unknown, command: Command, actorId: string) {
  const receipt = governedCollectionReceiptSchema.safeParse(value);
  if (!receipt.success) return false;
  const item = receipt.data;
  return item.acceptedBy === actorId && item.lineId === command.lineId && item.workspaceId === command.workspaceId && item.priceVersion === command.priceVersion && item.amountCents === command.amountCents && item.currency === command.currency && item.installationId === command.installationId && sameRecordedMoneyInstant(item.periodStart, command.periodStart) && sameRecordedMoneyInstant(item.periodEnd, command.periodEnd);
}
export function CollectionTerms(props: { graph: GovernedMoneyGraph; actorId: string; request?: typeof fetch }) { return <ScopedCollectionTerms key={`${props.graph.workspaceId}:${props.actorId}`} {...props} />; }
function ScopedCollectionTerms({ graph: initial, actorId, request = fetch }: { graph: GovernedMoneyGraph; actorId: string; request?: typeof fetch }) {
  const [graph, setGraph] = useState(initial), [phase, setPhase] = useState<Phase>("ready"), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [priceVersion, setPriceVersion] = useState(""), [installationId, setInstallationId] = useState(""), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const attempt = useRef<Command | null>(null), inflight = useRef<AbortController | null>(null), alive = useRef(true), feedback = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; inflight.current?.abort(); }; }, []);
  const price = graph.prices.find(item => item.version === priceVersion);
  const options = graph.installations.filter(item => !price?.definitionId || item.definitionId === price.definitionId);
  const admitted = graph.canPrepare && !!graph.payer?.customerConfigured && graph.prices.length > 0;
  const locked = phase !== "ready" || !!attempt.current;
  function focusFeedback(origin: Element | null) { if (document.activeElement === origin || document.activeElement === document.body) queueMicrotask(() => { if (alive.current && (document.activeElement === origin || document.activeElement === document.body)) feedback.current?.focus(); }); }
  async function reload() {
    if (inflight.current) return;
    const controller = new AbortController(), origin = document.activeElement; inflight.current = controller; setPhase("loading"); setError("");
    try {
      const response = await request(`/api/workspace/money-preparation?${new URLSearchParams({ workspaceId: initial.workspaceId })}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw Error(message(body));
      const next = governedMoneyGraphSchema.parse(body);
      if (next.workspaceId !== initial.workspaceId || next.terms.some(term => term.workspaceId !== initial.workspaceId)) throw Error("The terms belong to another workspace. Sign in and reload.");
      if (controller.signal.aborted || !alive.current) return;
      setGraph(next);
      if (attempt.current && next.terms.some(term => matches(term, attempt.current!, actorId))) { attempt.current = null; setNotice("Your exact terms and period are recorded. No card was charged."); }
      setPhase("ready"); focusFeedback(origin);
    } catch (cause) { if (!controller.signal.aborted && alive.current) { setPhase("blocked"); setError(cause instanceof Error ? cause.message : "Terms could not be loaded."); focusFeedback(origin); } }
    finally { if (!controller.signal.aborted && alive.current) inflight.current = null; }
  }
  async function accept(event?: FormEvent) {
    event?.preventDefault(); if (inflight.current || phase !== "ready" || !admitted) return;
    const origin = document.activeElement;
    if (!attempt.current) {
      if (!price || !start || !end || (price.definitionId && !options.some(item => item.id === installationId))) return;
      if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) { setError("Choose a valid start and end date."); focusFeedback(origin); return; }
      const periodStart = new Date(start).toISOString(), periodEnd = new Date(end).toISOString();
      if (Date.parse(periodEnd) <= Date.parse(periodStart)) { setError("The period must end after it starts."); focusFeedback(origin); return; }
      attempt.current = { action: "accept_collection_terms", workspaceId: initial.workspaceId, lineId: crypto.randomUUID(), priceVersion: price.version, amountCents: price.amountCents, currency: price.currency, installationId: installationId || null, periodStart, periodEnd };
    }
    const command = attempt.current, controller = new AbortController(); inflight.current = controller; setPhase("pending"); setError(""); setNotice("");
    try {
      const response = await request("/api/workspace/money-preparation", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw Error(message(body));
      if (!body || typeof body !== "object" || !("receipt" in body) || !("collectionDispatch" in body) || body.collectionDispatch !== "not_configured" || !matches(body.receipt, command, actorId)) throw Error("The acceptance receipt did not match the exact terms. Reload before continuing.");
      if (controller.signal.aborted || !alive.current) return;
      attempt.current = null;
      const receipt = governedCollectionReceiptSchema.parse(body.receipt);
      setGraph(current => ({ ...current, terms: [...current.terms.filter(term => term.lineId !== receipt.lineId), receipt] }));
      setPhase("blocked"); setNotice("Your exact terms and period are recorded. No card was charged. Reload to check current permission before another acceptance."); focusFeedback(origin);
    } catch (cause) { if (!controller.signal.aborted && alive.current) { setPhase("uncertain"); setError(cause instanceof Error ? cause.message : "Acceptance could not be confirmed."); focusFeedback(origin); } }
    finally { if (!controller.signal.aborted && alive.current) inflight.current = null; }
  }
  return <section className="mt-8 space-y-6" aria-labelledby="collection-terms-heading">
    <h2 id="collection-terms-heading" className="font-medium">Recorded price and period</h2>
    <p className="text-sm text-gray-muted">Review the written price and the exact period it covers. Accepting records these terms. Payment collection is not configured here.</p>
    {graph.payer ? <p className="text-sm">Payer: {graph.payer.kind === "agency" ? "Your agency" : "This business"}.{graph.payer.kind === "agency" ? " Agency approval to charge and the payment mandate remain separate." : " A payment mandate remains separate."}</p> : null}
    {!graph.canPrepare ? <p>Recorded history remains available. Only a current business owner with future work enabled can accept new terms.</p> : !graph.payer?.customerConfigured ? <p>Payment details have not been configured. No terms can be accepted yet.</p> : !graph.prices.length ? <p>No approved written price is recorded for this business.</p> : null}
    {admitted ? <Card padding="md"><form className="grid gap-4" onSubmit={event => void accept(event)}>
      <SelectInput label="Written price" value={priceVersion} disabled={locked} onChange={event => { setPriceVersion(event.target.value); setInstallationId(""); }} options={[{ value: "", label: "Choose a recorded price" }, ...graph.prices.map(item => ({ value: item.version, label: `${item.version} · ${formatMoney(item.amountCents, item.currency)}` }))]} required />
      {price ? <p className="text-sm">{formatMoney(price.amountCents, price.currency)} · {price.version}{price.definitionId ? ` · ${price.definitionId}` : ""}</p> : null}
      {price?.definitionId || options.length ? <SelectInput label="Covered installation" value={installationId} disabled={locked} required={!!price?.definitionId} onChange={event => setInstallationId(event.target.value)} options={[{ value: "", label: price?.definitionId ? "Choose the covered installation" : "General business terms" }, ...options.map(item => ({ value: item.id, label: item.definitionId }))]} /> : null}
      <div className="grid gap-4 sm:grid-cols-2"><TextInput label="Period starts (your local time)" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} required disabled={locked} /><TextInput label="Period ends (your local time)" type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} required disabled={locked} /></div>
      {start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end)) ? <p className="break-words text-sm text-gray-muted">Exact period: {new Date(start).toISOString()} to {new Date(end).toISOString()}.</p> : null}
      {!attempt.current ? <Button type="submit" disabled={locked || !price || !start || !end}>Accept these terms and period</Button> : phase === "ready" ? <Button type="button" onClick={() => void accept()}>Retry the exact acceptance</Button> : null}
    </form></Card> : null}
    {error || notice ? <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"} className={error ? "text-critical" : "text-sm"}>{error || notice}</p> : <p ref={feedback} tabIndex={-1} className="sr-only">Current recorded terms loaded.</p>}
    {phase === "pending" ? <p role="status">Recording the exact terms…</p> : null}{phase === "loading" ? <p role="status">Checking current terms and permission…</p> : null}
    <Button variant="secondary" disabled={phase === "pending" || phase === "loading"} onClick={() => void reload()}>Reload recorded terms</Button>
    {attempt.current ? <p className="text-sm text-gray-muted">The previous acceptance is uncertain. Reload to inspect it; any retry sends the same terms and command.</p> : null}
    <div><h3 className="font-medium">Accepted history</h3>{graph.terms.length ? <ul className="mt-3 space-y-4">{graph.terms.map(term => <li key={term.lineId} className="break-words text-sm"><p>{term.priceVersion} · {formatMoney(term.amountCents, term.currency)}</p><p className="text-gray-muted">{term.periodStart && term.periodEnd ? `${term.periodStart} to ${term.periodEnd}` : "Period not recorded"}</p></li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No collection terms have been accepted.</p>}</div>
  </section>;
}
