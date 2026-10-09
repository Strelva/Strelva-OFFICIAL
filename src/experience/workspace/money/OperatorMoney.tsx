"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextInput, SelectInput } from "@/components/ui/TextInput";
import { formatMoney } from "@/platform/connect/money-format";
import { governedOperatorGraphSchema, operatorMoneyCommandSchema, type GovernedOperatorGraph } from "@/platform/connect/governed-money-contract";
type ReviewedPayout = GovernedOperatorGraph["payouts"][number];
type Attempt = { kind: "configuration"; command: z.infer<typeof operatorMoneyCommandSchema> } | { kind: "payout"; command: { payoutId: string; profileVersion: string }; reviewed: ReviewedPayout };
function message(value: unknown) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "The operation could not be confirmed. Reload current records before continuing."; }
function equal(a: unknown, b: unknown) { return JSON.stringify(Object.entries(a as Record<string, unknown>).sort()) === JSON.stringify(Object.entries(b as Record<string, unknown>).sort()); }
function number(value: FormDataEntryValue | null) { const raw = String(value ?? "").trim(); if (!raw) throw Error("The written amount or rate is required."); return Number(raw); }
function sameReviewedPayout(current: ReviewedPayout, reviewed: ReviewedPayout) {
  // Recipient's current profile may change after acceptance. Recorded
  // authorization and immutable payout/source facts remain historical identity.
  return current.id === reviewed.id && current.sourceAccountId === reviewed.sourceAccountId && current.sourceTransaction === reviewed.sourceTransaction && current.recipientAccountId === reviewed.recipientAccountId && current.amountCents === reviewed.amountCents && current.currency === reviewed.currency && current.agreementVersion === reviewed.agreementVersion && current.authorizationProfileVersion === reviewed.authorizationProfileVersion;
}
function utc(value: FormDataEntryValue | null) { const raw = String(value ?? ""); if (!raw || Number.isNaN(Date.parse(raw))) throw Error("Choose an explicit valid agreement date."); return new Date(raw).toISOString(); }
export function OperatorMoney(props: { graph: GovernedOperatorGraph; actorId: string; profileVersion: string | null; executionEnabled: boolean; request?: typeof fetch }) { return <ScopedOperatorMoney key={`${props.graph.workspaceId}:${props.actorId}`} {...props} />; }
function ScopedOperatorMoney({ graph: initial, actorId, profileVersion, executionEnabled, request = fetch }: { graph: GovernedOperatorGraph; actorId: string; profileVersion: string | null; executionEnabled: boolean; request?: typeof fetch }) {
  const [graph, setGraph] = useState(initial), [error, setError] = useState(""), [notice, setNotice] = useState(""), [phase, setPhase] = useState<"ready" | "pending" | "blocked" | "loading">("ready"), [mode, setMode] = useState<"" | "price" | "agreement">("");
  const attempt = useRef<Attempt | null>(null), inflight = useRef<AbortController | null>(null), alive = useRef(true), feedback = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; inflight.current?.abort(); }; }, []);
  const locked = phase !== "ready" || !!attempt.current;
  function focus(origin: Element | null) { queueMicrotask(() => { if (alive.current && (document.activeElement === origin || document.activeElement === document.body)) feedback.current?.focus(); }); }
  async function reload() {
    if (inflight.current) return; const origin = document.activeElement, controller = new AbortController(); inflight.current = controller; setPhase("loading"); setError("");
    try {
      const response = await request(`/api/admin/money-configuration?${new URLSearchParams({ workspaceId: initial.workspaceId })}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const value: unknown = await response.json().catch(() => null); if (!response.ok) throw Error(message(value)); const parsed = governedOperatorGraphSchema.parse(value); if (parsed.workspaceId !== initial.workspaceId) throw Error("Money records belong to another workspace.");
      if (controller.signal.aborted || !alive.current) return; setGraph(parsed);
      const pending = attempt.current;
      if (pending?.kind === "payout") {
        const row = parsed.payouts.find(item => item.id === pending.command.payoutId);
        if (!row || !sameReviewedPayout(row, pending.reviewed)) throw Error("The reviewed payout facts changed. Keep this uncertain operation for reconciliation.");
        if (row.transferId) { attempt.current = null; setNotice("The accepted payout receipt is recorded. No new payout was requested."); }
      }
      // A configuration replay must still return the original actual operator
      // acknowledgment; a row's existence alone cannot prove who recorded it.
      setPhase("ready"); focus(origin);
    } catch (cause) { if (!controller.signal.aborted && alive.current) { setPhase("blocked"); setError(cause instanceof Error ? cause.message : "Money records could not be read."); focus(origin); } }
    finally { if (!controller.signal.aborted && alive.current) inflight.current = null; }
  }
  async function run(next: Attempt) {
    if (inflight.current || phase !== "ready") return; if (attempt.current && !equal(attempt.current, next)) return;
    const origin = document.activeElement, controller = new AbortController(); attempt.current = next; inflight.current = controller; setPhase("pending"); setError(""); setNotice("");
    try {
      const response = await request(next.kind === "configuration" ? "/api/admin/money-configuration" : "/api/admin/money-payouts", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next.command), signal: controller.signal });
      const value: unknown = await response.json().catch(() => null); if (!response.ok) throw Error(message(value));
      if (next.kind === "configuration") {
        const receipt = z.object({ action: z.literal(next.command.action), recordedBy: z.literal(actorId), replayed: z.boolean(), command: operatorMoneyCommandSchema }).strict().parse(value);
        if (!equal(receipt.command, next.command)) throw Error("Configuration receipt does not match the exact written terms.");
      } else z.object({ transferId: z.string().regex(/^tr_[A-Za-z0-9]+$/), payoutId: z.literal(next.command.payoutId), profileVersion: z.literal(next.command.profileVersion), requestedBy: z.literal(actorId) }).strict().parse(value);
      if (controller.signal.aborted || !alive.current) return; attempt.current = null; setPhase("blocked"); setNotice(next.kind === "configuration" ? "The exact written configuration is recorded. Reload current records before another operation." : "The transfer was accepted. Reload to inspect the persisted receipt; this does not request another transfer."); focus(origin);
    } catch (cause) { if (!controller.signal.aborted && alive.current) { setPhase("blocked"); setError(cause instanceof Error ? cause.message : "The operation could not be confirmed."); focus(origin); } }
    finally { if (!controller.signal.aborted && alive.current) inflight.current = null; }
  }
  function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked) return;
    try {
      const fields = new FormData(event.currentTarget), version = String(fields.get("version") ?? ""), effectiveFrom = utc(fields.get("effectiveFrom")), effectiveUntil = fields.get("effectiveUntil") ? utc(fields.get("effectiveUntil")) : null;
      const command = operatorMoneyCommandSchema.parse(mode === "price" ? { action: "record_price", version, amountCents: number(fields.get("amountCents")), currency: String(fields.get("currency") ?? ""), definitionId: String(fields.get("definitionId") ?? "").trim() || null, effectiveFrom, effectiveUntil } : { action: "record_agreement", workspaceId: initial.workspaceId, kind: fields.get("kind"), version, rateReference: fields.get("rateReference"), rateBps: number(fields.get("rateBps")), effectiveFrom, effectiveUntil });
      void run({ kind: "configuration", command });
    } catch { setError("Enter the exact written terms, valid dates and selected amount or rate before recording."); focus(document.activeElement); }
  }
  const retry = attempt.current;
  return <div className="mt-8 space-y-6">
    <Card padding="md"><h2 className="font-medium">Record written terms</h2><p className="mt-3 text-sm text-gray-muted">Enter the agreed values and references. No commercial price, royalty rate or recurring interval is supplied by Strelva.</p>
      <SelectInput className="mt-4" label="What was agreed?" value={mode} disabled={locked} onChange={event => setMode(event.target.value as typeof mode)} options={[{ value: "", label: "Choose the written decision" }, { value: "price", label: "Platform collection price" }, { value: "agreement", label: "Agency or creator agreement" }]} />
      {mode ? <form className="mt-4 grid gap-4" onSubmit={record}>
        <TextInput name="version" label="Written version reference" maxLength={200} required disabled={locked} />
        {mode === "price" ? <><TextInput name="amountCents" label="Agreed amount in minor currency units" type="number" min={1} max={100000000} step={1} required disabled={locked} /><TextInput name="currency" label="Agreed currency (three lowercase letters)" pattern="[a-z]{3}" maxLength={3} required disabled={locked} /><TextInput name="definitionId" label="Covered source definition (optional)" maxLength={200} disabled={locked} helperText="Leave empty only for an agreed general business price. The server validates a supplied source." /></> : <><SelectInput name="kind" label="Agreement beneficiary" disabled={locked} required options={[{ value: "", label: "Choose the written agreement" }, { value: "agency", label: "Agency" }, { value: "creator", label: "Creator" }]} /><TextInput name="rateReference" label="Written rate reference" maxLength={200} required disabled={locked} /><TextInput name="rateBps" label="Agreed rate in basis points" type="number" min={0} max={10000} step={1} required disabled={locked} /></>}
        <div className="grid gap-4 sm:grid-cols-2"><TextInput name="effectiveFrom" label="Effective from (your local time)" type="datetime-local" required disabled={locked} /><TextInput name="effectiveUntil" label="Effective until (optional, your local time)" type="datetime-local" disabled={locked} /></div><Button type="submit" disabled={locked}>Record these written terms</Button>
      </form> : null}
    </Card>
    {error || notice ? <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"} className={error ? "text-critical" : "text-sm"}>{error || notice}</p> : <p ref={feedback} tabIndex={-1} className="sr-only">Current money records loaded.</p>}
    <Button variant="secondary" disabled={phase === "pending" || phase === "loading"} onClick={() => void reload()}>Reload current money records</Button>
    {phase === "pending" || phase === "loading" ? <p role="status">{phase === "pending" ? "Recording this exact operation…" : "Checking current operator access and records…"}</p> : null}
    {retry ? <p className="text-sm text-gray-muted">The previous operation is uncertain. New operations stay locked. Reload and inspect its receipt before an identical retry.</p> : null}
    {retry && phase === "ready" && (retry.kind !== "payout" || (executionEnabled && profileVersion === retry.command.profileVersion)) ? <Button onClick={() => void run(retry)}>Retry the exact {retry.kind === "payout" ? "payout" : "configuration"}</Button> : null}
    <section><h2 className="font-medium">Recorded agreements</h2>{graph.agreements.length ? <ul className="mt-3 space-y-3">{graph.agreements.map(item => <li key={`${item.kind}:${item.version}`} className="break-words text-sm">{item.kind} · {item.version} · {item.rateBps} basis points · {item.rateReference}<span className="block text-gray-muted">{item.effectiveFrom} to {item.effectiveUntil ?? "No recorded end"}</span></li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No written agreement is recorded for this workspace.</p>}</section>
    <section><h2 className="font-medium">Recorded prices</h2>{graph.prices.length ? <ul className="mt-3 space-y-3">{graph.prices.map(item => <li key={item.version} className="break-words text-sm">{item.version} · {formatMoney(item.amountCents, item.currency)} · {item.definitionId ?? "General business price"}<span className="block text-gray-muted">{item.effectiveFrom} to {item.effectiveUntil ?? "No recorded end"}</span></li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No platform collection price is recorded.</p>}</section>
    <section><h2 className="font-medium">Payout review</h2><p className="mt-3 text-sm text-gray-muted">Authorization records one immutable payout and profile. Dispatch is a separate explicit action and rechecks current authority, recipient and settled source funds.</p>{!profileVersion ? <p className="mt-3">An approved fee and liability profile is not configured. Payout authorization and execution are unavailable.</p> : <p className="mt-3 text-sm">Configured profile: {profileVersion}. {!executionEnabled ? "Payout execution is disabled." : ""}</p>}
      {graph.payouts.length ? <ul className="mt-4 space-y-4">{graph.payouts.map(item => <li key={item.id} className="rounded-xl border border-gray-border p-4 text-sm"><p>{formatMoney(item.amountCents, item.currency)} · {item.agreementVersion}</p><dl className="mt-3 grid gap-3"><div><dt className="text-gray-muted">Source charge</dt><dd className="break-all">{item.sourceTransaction}</dd></div><div><dt className="text-gray-muted">Recipient</dt><dd className="break-all">{item.recipientAccountId}</dd></div><div><dt className="text-gray-muted">Current recipient profile: {item.recipientProfileVersion ?? "Not configured"}</dt></div><div><dt className="text-gray-muted">Authorization</dt><dd>{item.authorizedBy ? `Recorded for ${item.authorizationProfileVersion}` : "Not recorded"}</dd></div></dl>
        {item.transferId ? <p className="mt-3 break-all">Accepted transfer receipt: {item.transferId}</p> : <div className="mt-4 flex flex-wrap gap-3">{profileVersion ? <Button variant="secondary" disabled={locked} onClick={() => void run({ kind: "configuration", command: { action: "authorize_payout", payoutId: item.id, profileVersion } })}>Authorize this payout for {profileVersion}</Button> : null}{executionEnabled && profileVersion && item.authorizationProfileVersion === profileVersion && item.recipientProfileVersion === profileVersion && item.authorizedBy ? <Button disabled={locked} onClick={() => void run({ kind: "payout", command: { payoutId: item.id, profileVersion }, reviewed: { ...item } })}>Send this approved payout</Button> : null}</div>}
      </li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No reserved payout is awaiting review.</p>}
    </section>
  </div>;
}
