"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { Chip } from "../console";
import {
  PRIORITY_LABELS, QUEUE_KIND_LABELS,
  type OperatorQueue, type QueueBusiness, type QueueItem, type QueuePriority,
} from "@/platform/operator-queue/contracts";
import { prefillMinutes } from "@/platform/operator-queue/rules";
import { closeQueueItemAction, markQueueItemAction, resolveQueueDraftsAction, type QueueActionResult } from "./actions";
import { QueueEventDetail, hasQueueEventDetail } from "@/components/dashboard/QueueEventDetail";

type Tone = "good" | "warn" | "crit" | "neutral" | "accent";
const PRIORITY_TONE: Record<QueuePriority, Tone> = { P1: "crit", P2: "warn", P3: "accent", P4: "neutral" };

function businessName(business: QueueBusiness) {
  if (business.kind === "strelva") return "Strelva";
  return business.name;
}

function age(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function dueLabel(item: QueueItem, now: number) {
  if (!item.dueAt) return null;
  const at = Date.parse(item.dueAt);
  const time = new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  if (item.late) return `Late since ${time}`;
  return at - now < 24 * 3600_000 ? `Due ${time}` : `Due ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function ownerReachLabel(item: QueueItem): string | null {
  const reach = item.ownerReach;
  if (!reach) return null;
  if (reach.status === "email_paused") return "Owner not told: client email is paused";
  if (reach.status === "not_told") return "Owner not told yet";
  return `Owner told by ${reach.via === "email" ? "email" : "approve link"} ${new Date(reach.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Focused time per open row, for the minutes prefill. Counts only while the
 *  row is open and the tab is visible and focused, so idle tabs don't count. */
function useFocusedTime(open: boolean) {
  const total = useRef(0);
  useEffect(() => {
    if (!open) return;
    let last = Date.now();
    const tick = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible" && document.hasFocus()) total.current += now - last;
      last = now;
    }, 1000);
    return () => window.clearInterval(tick);
  }, [open]);
  return total;
}

function newId() { return crypto.randomUUID(); }

function Row({ item, me, operators, now, onResult, actionsEnabled }: {
  item: QueueItem; me: string; operators: OperatorQueue["operators"]; now: number; onResult: (result: QueueActionResult) => void; actionsEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"none" | "close" | "snooze" | "note" | "handoff">("none");
  const [pending, start] = useTransition();
  const focused = useFocusedTime(open);
  const [closeId] = useState(newId);
  const [entryId] = useState(newId);
  const [closeState, setCloseState] = useState<"done" | "dismissed">("done");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("");
  const [logMinutes, setLogMinutes] = useState(true);
  const [snoozeDays, setSnoozeDays] = useState("1");
  const [text, setText] = useState("");
  const [handTo, setHandTo] = useState("");
  const mine = item.assignee?.userId === me;
  const late = item.late;
  const due = dueLabel(item, now);
  const reach = ownerReachLabel(item);

  function mark(action: Parameters<typeof markQueueItemAction>[0]["action"], payload?: Record<string, unknown>) {
    start(async () => {
      const result = await markQueueItemAction({ commandId: newId(), key: item.key, action, payload });
      onResult(result);
      if (result.ok) { setPanel("none"); router.refresh(); }
    });
  }

  function openClose() {
    setMinutes(String(prefillMinutes(focused.current)));
    setPanel("close");
  }

  function submitClose(event: FormEvent) {
    event.preventDefault();
    const value = Number(minutes);
    const sendMinutes = logMinutes && /^\d+$/.test(minutes) && value >= 1;
    start(async () => {
      const result = await closeQueueItemAction({
        commandId: closeId, key: item.key, state: closeState, reason: reason.trim() || (actionsEnabled ? "" : closeState === "done" ? "Handled" : "Not needed"),
        minutes: sendMinutes ? { entryId, minutes: value } : null,
      });
      onResult(result);
      if (result.ok) { setPanel("none"); router.refresh(); }
    });
  }

  return (
    <li className="px-[18px] py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
          className="min-w-0 flex-1 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip tone={PRIORITY_TONE[item.priority]}>{item.priority} · {PRIORITY_LABELS[item.priority]}</Chip>
            <Chip>{QUEUE_KIND_LABELS[item.kind]}</Chip>
            {item.pinned && <Chip tone="accent">Pinned</Chip>}
            {late && <Chip tone="crit">Late</Chip>}
          </span>
          <span className="mt-1.5 block text-[13.5px] font-semibold leading-snug text-warm-white">{item.title}</span>
          <span className="mt-1 block text-[12px] leading-5 text-gray-muted">
            {businessName(item.business)}
            {item.business.kind === "tenant" && <span className="text-gray-faint"> · not yet a workspace</span>}
            {item.system && <> · {item.system.label}</>}
            {" · "}{age(item.ageMs)} old
            {due && <> · <span className={late ? "text-critical" : undefined}>{due}</span></>}
          </span>
          {(item.priorityReason || reach || item.assignee) && (
            <span className="mt-1 block text-[12px] leading-5 text-gray-faint">
              {[item.priorityReason, reach, item.assignee ? `Taken by ${mine ? "you" : item.assignee.email ?? "an operator"}` : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </button>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Link href={item.href} className="rounded-full px-3 py-1.5 text-[12px] font-medium text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            Open
          </Link>
          {mine
            ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark("release")}>Release</Button>
            : <Button size="sm" variant="secondary" disabled={pending} onClick={() => mark("take")}>Take</Button>}
          <Button size="sm" variant="primary" disabled={pending} onClick={openClose}>Close</Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-glass-border bg-white/[0.02] p-3">
          {actionsEnabled && item.kind === "draft_review" && item.review && hasQueueEventDetail(item.review) && <QueueEventDetail event={item.review} />}
          {actionsEnabled && item.kind === "draft_review" && item.move === "strelva" && <div className="mb-3 flex flex-wrap gap-2">
            {(["approve", "skip", "escalate"] as const).map((action) => <Button key={action} size="sm" disabled={pending} onClick={() => start(async () => {
              const result = await resolveQueueDraftsAction({ keys: [item.key], action });
              onResult(result); router.refresh();
            })}>{action === "approve" ? "Approve" : action === "skip" ? "Skip" : "Ask the owner"}</Button>)}
          </div>}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark(item.pinned ? "unpin" : "pin")}>{item.pinned ? "Unpin" : "Pin for a day"}</Button>
            <Button size="sm" variant="ghost" disabled={pending || item.priority === "P1"} title={item.priority === "P1" ? "Harm-now items can't be snoozed" : undefined} onClick={() => setPanel("snooze")}>Snooze</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPanel("note")}>Add note</Button>
            {operators.length > 1 && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPanel("handoff")}>Hand off</Button>}
            {item.move === "owner" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark("owner_told", { via: "email" })}>Owner told by email</Button>}
          </div>
          {item.notes.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-gray-muted">
              {item.notes.map((note) => <li key={note.id}><span className="text-warm-white">{note.body}</span> · {note.by ?? "operator"}, {new Date(note.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</li>)}
            </ul>
          )}
          {panel === "snooze" && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); mark("snooze", { until: new Date(Date.now() + Number(snoozeDays) * 86_400_000 - 60_000).toISOString(), reason: text.trim() }); }}>
              <SelectInput label="For" value={snoozeDays} onChange={(event) => setSnoozeDays(event.target.value)}
                options={["1", "2", "3", "7"].map((days) => ({ value: days, label: `${days} day${days === "1" ? "" : "s"}` }))} />
              <div className="min-w-[200px] flex-1">
                <TextInput label="Reason" value={text} onChange={(event) => setText(event.target.value)} maxLength={280} required />
              </div>
              <Button size="sm" type="submit" disabled={pending || !text.trim()}>Snooze</Button>
            </form>
          )}
          {panel === "note" && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); mark("note", { body: text.trim() }); setText(""); }}>
              <div className="min-w-[200px] flex-1">
                <TextInput label="Note" value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} required />
              </div>
              <Button size="sm" type="submit" disabled={pending || !text.trim()}>Add note</Button>
            </form>
          )}
          {panel === "handoff" && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); mark("hand_off", { assigneeUserId: handTo }); }}>
              <div className="min-w-[200px] flex-1">
                <SelectInput label="Hand to" value={handTo} onChange={(event) => setHandTo(event.target.value)} required
                  options={[{ value: "", label: "Choose an operator" }, ...operators.filter((operator) => operator.userId !== me).map((operator) => ({ value: operator.userId, label: operator.email }))]} />
              </div>
              <Button size="sm" type="submit" disabled={pending || !handTo}>Hand off</Button>
            </form>
          )}
        </div>
      )}

      {panel === "close" && (
        <form onSubmit={submitClose} className="mt-3 rounded-xl border border-accent/30 bg-accent-dim/40 p-3" aria-label={`Close ${item.title}`}>
          <div className="flex flex-wrap items-end gap-2">
            <SelectInput label="Outcome" value={closeState} onChange={(event) => setCloseState(event.target.value as "done" | "dismissed")}
              options={[{ value: "done", label: "Done" }, { value: "dismissed", label: "Dismissed" }]} />
            <div className="min-w-[180px] flex-1">
              <TextInput label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} required={actionsEnabled} placeholder={closeState === "done" ? "What happened?" : "Why is it not needed?"} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-32">
              <TextInput label="Minutes on this?" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/[^\d]/g, ""))} disabled={!logMinutes} aria-describedby={`${item.key}-minutes-hint`} />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[12px] text-gray-muted">
              <input type="checkbox" checked={logMinutes} onChange={(event) => setLogMinutes(event.target.checked)} className="accent-[var(--color-accent)]" />
              Log minutes
            </label>
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPanel("none")}>Cancel</Button>
              <Button size="sm" type="submit" loading={pending} disabled={pending}>Close item</Button>
            </div>
          </div>
          <p id={`${item.key}-minutes-hint`} className="mt-2 text-[11.5px] leading-5 text-gray-faint">
            Prefilled from the time this item was open in front of you. Edit or skip it.
            {item.business.kind !== "workspace" && " This business is not yet a workspace, so minutes can't be logged against it."}
          </p>
        </form>
      )}
    </li>
  );
}

export function QueueBoard({ queue, me, actionsEnabled = false }: { queue: OperatorQueue; me: string; actionsEnabled?: boolean }) {
  const [message, setMessage] = useState<QueueActionResult | null>(null);
  const [showParked, setShowParked] = useState(false);
  const now = Date.parse(queue.generatedAt);
  const urgent = queue.items.filter((item) => item.pinned || item.priority === "P1" || item.priority === "P2");
  const rest = queue.items.filter((item) => !urgent.includes(item));
  const groups = new Map<string, { name: string; items: QueueItem[] }>();
  for (const item of rest) {
    const key = item.business.kind === "workspace" ? item.business.workspaceId : item.business.kind === "tenant" ? item.business.tenantId : "strelva";
    const group = groups.get(key) ?? { name: businessName(item.business), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const rowProps = { me, operators: queue.operators, now, onResult: setMessage, actionsEnabled };

  return (
    <div className="space-y-4">
      {!queue.complete && (
        <div role="alert" className="rounded-2xl border border-warning/40 bg-warning/10 px-[18px] py-3 text-[13px] leading-5 text-warm-white">
          <p className="font-semibold">This list is incomplete.</p>
          <ul className="mt-1 text-gray-muted">
            {queue.gaps.map((gap) => <li key={`${gap.kind}:${gap.source}`}>Couldn&apos;t read {gap.source.toLowerCase()} ({gap.reason}).</li>)}
          </ul>
        </div>
      )}
      {message && (
        <p role="status" className={`rounded-xl px-[18px] py-2.5 text-[13px] ${message.ok ? "bg-positive/10 text-positive" : "bg-critical/10 text-critical"}`}>{message.message}</p>
      )}

      <section className="rounded-2xl border border-glass-border bg-glass overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-[18px] pt-[15px] pb-3">
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-warm-white">Now</h2>
          <span className="text-[11px] font-mono text-gray-faint tabular-nums">{urgent.length} harm now or waiting on Strelva</span>
        </div>
        {urgent.length === 0
          ? <p className="px-[18px] pb-4 text-[13px] text-gray-muted">Nothing is harming a site or waiting on Strelva{queue.complete ? "." : " in the sources that could be read."}</p>
          : <ul className="divide-y divide-glass-border border-t border-glass-border">{urgent.map((item) => <Row key={item.key} item={item} {...rowProps} />)}</ul>}
      </section>

      {[...groups.entries()].map(([key, group]) => (
        <section key={key} className="rounded-2xl border border-glass-border bg-glass overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-[18px] pt-[15px] pb-3">
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-warm-white">{group.name}</h2>
            <span className="text-[11px] font-mono text-gray-faint tabular-nums">{group.items.length}</span>
          </div>
          {actionsEnabled && <BulkDraftReview items={group.items} onResult={setMessage} />}
          <ul className="divide-y divide-glass-border border-t border-glass-border">{group.items.map((item) => <Row key={item.key} item={item} {...rowProps} />)}</ul>
        </section>
      ))}

      {queue.parked.length > 0 && (
        <section className="rounded-2xl border border-glass-border bg-glass overflow-hidden">
          <button type="button" onClick={() => setShowParked((value) => !value)} aria-expanded={showParked}
            className="flex w-full items-center justify-between gap-3 px-[18px] py-[15px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <span className="text-[13.5px] font-semibold text-warm-white">Closed and snoozed</span>
            <span className="text-[11px] font-mono text-gray-faint tabular-nums">{queue.parked.length}</span>
          </button>
          {showParked && (
            <ul className="divide-y divide-glass-border border-t border-glass-border">
              {queue.parked.map((item) => (
                <li key={item.key} className="flex flex-col gap-2 px-[18px] py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 text-[12.5px] leading-5 text-gray-muted">
                    <span className="text-warm-white">{item.title}</span> · {businessName(item.business)} ·{" "}
                    {item.closedElsewhere ? `Closed by ${item.closedElsewhere.by}` : item.closed ? `${item.closed.state === "done" ? "Done" : "Dismissed"}${item.closed.reason ? `: ${item.closed.reason}` : ""}` : item.snoozed ? `Snoozed: ${item.snoozed.reason}` : ""}
                  </span>
                  {!item.closedElsewhere && (
                    <ParkedAction item={item} onResult={setMessage} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Review the actual proposed changes before a per-business bulk approval. */
function BulkDraftReview({ items, onResult }: { items: QueueItem[]; onResult: (result: QueueActionResult) => void }) {
  const drafts = items.filter((item) => item.kind === "draft_review" && item.move === "strelva" && item.review);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (drafts.length < 2) return null;
  return <div className="border-t border-glass-border p-4">
    <Button size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>Review {drafts.length} drafts together</Button>
    {open && <div className="mt-3 space-y-3">
      {drafts.map((item) => <div key={item.key} className="space-y-2">
        <label className="flex items-center gap-2 text-[13px] text-warm-white"><input type="checkbox" checked={selected.includes(item.key)} disabled={pending} onChange={(event) => setSelected((keys) => event.target.checked ? [...keys, item.key] : keys.filter((key) => key !== item.key))} />{item.title}</label>
        {item.review && <QueueEventDetail event={item.review} />}
      </div>)}
      <Button size="sm" loading={pending} disabled={pending || !selected.length} onClick={() => start(async () => {
        const result = await resolveQueueDraftsAction({ keys: selected, action: "approve" }); onResult(result);
        setSelected((keys) => keys.filter((key) => !result.results.some((row) => row.key === key && row.changed))); router.refresh();
      })}>Approve {selected.length} reviewed drafts</Button>
    </div>}
  </div>;
}

function ParkedAction({ item, onResult }: { item: QueueItem; onResult: (result: QueueActionResult) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const action = item.closed ? "reopen" : "unsnooze";
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
      const result = await markQueueItemAction({ commandId: newId(), key: item.key, action });
      onResult(result);
      if (result.ok) router.refresh();
    })}>{item.closed ? "Reopen" : "Unsnooze"}</Button>
  );
}
