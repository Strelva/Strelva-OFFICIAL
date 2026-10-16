"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { StSegmented } from "@/components/ui/strelva/Kit";
import { aiUsageLine, type AiControlsClient, type AiUsageEnforcement } from "@/platform/ai-controls/contracts";

/**
 * One client's Strelva usage and, when the viewer may change it, the pause,
 * monthly limit and review-reply hold. Shared by the agency screen and the
 * operator console; it only reads what the server sent and reports a draft.
 *
 * Amounts: usage is measured only in dollars, and no dollar figure shows to an
 * agency or owner until pricing is decided. Without `amounts` the panel says
 * where Strelva work stands (running, paused, or stopped at a limit until the
 * reset) and leaves any limit as it is; only the operator console passes
 * `amounts` and sees the figures and the limit field.
 */
export interface UsageDraft { paused: boolean; monthlyCapCents: number | null; reviewAutoPost: "client_choice" | "held"; reason: string }
export type UsageSaveResult = { ok: true } | { ok: false; error: string };

export const usd = (value: number) => `$${value.toFixed(2)}`;
export const resetDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const changedDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "" is no limit; "12.50" is 1250 cents. Anything else is not a limit. */
export function parseLimitCents(text: string): { cents: number | null } | { error: string } {
  const value = text.trim();
  if (!value) return { cents: null };
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return { error: "Enter a dollar amount like 25 or 12.50." };
  const cents = Math.round(Number(value) * 100);
  if (cents > 10_000_000) return { error: "The most you can set is $100,000.00." };
  return { cents };
}

export function UsageSummary({ client, enforcement, clientName, amounts = false }: { client: AiControlsClient; enforcement: AiUsageEnforcement; clientName: string; amounts?: boolean }) {
  const line = aiUsageLine(client, enforcement);
  const { setBy, changedAt } = client.budget.controls;
  const owner = setBy?.kind === "agency" && setBy.agencyName ? setBy.agencyName : "Strelva";
  if (!amounts) {
    const atLimit = line.limitUsd !== null && line.usedUsd >= line.limitUsd;
    return <div className="grid gap-1 text-sm">
      <p>{client.budget.controls.paused ? `Strelva work for ${clientName} is paused.` : atLimit ? `Strelva work for ${clientName} reached this month’s limit. It starts again ${resetDate(line.resetsAt)}.` : `Strelva work for ${clientName} is running. This month resets ${resetDate(line.resetsAt)}.`}</p>
      {line.unknown ? <p className="text-gray-muted">Some calls this period have no recorded cost. While a limit is set, Strelva work stays paused until {resetDate(line.resetsAt)}.</p> : null}
      {line.limitSource === "agency" || line.limitSource === "operator" ? <p>{owner} set a monthly limit.</p> : null}
      {client.budget.controls.reviewAutoPost === "held" ? <p>Automatic review replies are held: every reply waits for {clientName}.</p> : null}
      {setBy && changedAt ? <p className="text-xs text-gray-muted">Last changed by {setBy.kind === "agency" && setBy.agencyName ? setBy.agencyName : "a Strelva operator"} on {changedDate(changedAt)}</p> : null}
    </div>;
  }
  const limit = line.limitUsd === null ? "No usage limit"
    : line.limitSource === "agency" || line.limitSource === "operator" ? `Limit ${usd(line.limitUsd)} set by ${owner}`
      : line.limitSource === "free" ? `Included allowance ${usd(line.limitUsd)}` : `Plan limit ${usd(line.limitUsd)}`;
  return <div className="grid gap-1 text-sm">
    <p>Usage this month: {usd(line.usedUsd)} estimated · resets {resetDate(line.resetsAt)}{line.heldUsd > 0 ? ` · ${usd(line.heldUsd)} held for work in progress` : ""}</p>
    {line.unknown ? <p className="text-gray-muted">Some calls this period have no recorded cost. While a limit is set, Strelva work stays paused until {resetDate(line.resetsAt)}.</p> : null}
    <p>{limit}</p>
    {client.budget.controls.paused ? <p>Strelva work for {clientName} is paused.</p> : null}
    {client.budget.controls.reviewAutoPost === "held" ? <p>Automatic review replies are held: every reply waits for {clientName}.</p> : null}
    {setBy && changedAt ? <p className="text-xs text-gray-muted">Last changed by {setBy.kind === "agency" && setBy.agencyName ? setBy.agencyName : "a Strelva operator"} on {changedDate(changedAt)}</p> : null}
  </div>;
}

export function UsageControlsPanel({ client, enforcement, clientName, who, canChange, save, saved, onEdit, amounts = false }: {
  client: AiControlsClient; enforcement: AiUsageEnforcement; clientName: string; who: "agency" | "operator"; canChange: boolean;
  /** Dollar figures and the limit field: the operator console only, until pricing is decided. */
  amounts?: boolean;
  /** Kept by the parent: a save remounts this panel (keyed by revision), so the flag cannot live here. */
  saved: boolean; onEdit: () => void;
  save: (draft: UsageDraft) => Promise<UsageSaveResult>;
}) {
  const controls = client.budget.controls;
  const startLimit = controls.monthlyCapCents === null ? "" : (controls.monthlyCapCents / 100).toFixed(2);
  const [paused, setPaused] = useState(controls.paused), [limit, setLimit] = useState(startLimit), [auto, setAuto] = useState(controls.reviewAutoPost);
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const parsed = parseLimitCents(limit);
  const limitError = "error" in parsed ? parsed.error : undefined;
  const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 500;
  const changed = paused !== controls.paused || auto !== controls.reviewAutoPost || ("cents" in parsed && parsed.cents !== controls.monthlyCapCents);
  async function submit() {
    if (!("cents" in parsed)) return;
    setBusy(true); setMessage(null); onEdit();
    const result = await save({ paused, monthlyCapCents: parsed.cents, reviewAutoPost: auto, reason: reason.trim() });
    setBusy(false);
    if (result.ok) setReason(""); else setMessage(result.error);
  }
  return <div className="grid gap-4">
    <UsageSummary client={client} enforcement={enforcement} clientName={clientName} amounts={amounts} />
    {canChange ? <div className="grid gap-4">
      <div className="grid gap-1"><span className="text-sm font-medium">Strelva work</span>
        <StSegmented label="Strelva work" value={paused ? "paused" : "running"} options={[{ value: "running", label: "Running" }, { value: "paused", label: "Paused" }]} onChange={value => { setPaused(value === "paused"); onEdit(); }} /></div>
      {amounts ? <TextInput label="Monthly usage limit (USD)" inputMode="decimal" value={limit} onChange={event => { setLimit(event.target.value); onEdit(); }} error={limitError} helperText="Leave blank for no limit. Work pauses when the limit is reached and resumes when the period resets." disabled={busy} /> : null}
      <div className="grid gap-1"><span className="text-sm font-medium">Automatic review replies</span>
        <StSegmented label="Automatic review replies" value={auto} options={[{ value: "client_choice", label: "Owner’s choice" }, { value: "held", label: `Held: every reply waits for ${clientName}` }]} onChange={value => { setAuto(value); onEdit(); }} /></div>
      <TextInput label="Reason for change" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} helperText="Recorded with who changed it and when." disabled={busy} />
      <div><Button variant="secondary" size="sm" disabled={!changed || !reasonOk || !!limitError} loading={busy} onClick={() => void submit()}>Save usage controls</Button></div>
      {message ? <p role="alert" className="text-sm text-critical">{message}</p> : null}
      {saved ? <p role="status" className="text-sm">{who === "agency" ? `Saved. ${clientName} sees who changed this.` : `Saved. ${clientName} sees that Strelva changed this.`}</p> : null}
    </div> : <p className="text-xs text-gray-muted">Only agency owners and admins can change these.</p>}
  </div>;
}
