"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import {
  PRIORITY_LABELS, QUEUE_KIND_LABELS,
  type OperatorQueue, type QueueBusiness, type QueueItem,
} from "@/platform/operator-queue/contracts";
import { prefillMinutes } from "@/platform/operator-queue/rules";
import { closeQueueItemAction, markQueueItemAction, resolveQueueDraftsAction, type QueueActionResult } from "./actions";
import { QueueEventDetail, hasQueueEventDetail } from "@/components/dashboard/QueueEventDetail";
import { QueueSourceActions } from "./QueueSourceActions";

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

function Row({ item, me, operators, now, onResult, actionsEnabled, businessLeads }: {
  item: QueueItem; me: string; operators: OperatorQueue["operators"]; now: number; onResult: (result: QueueActionResult) => void; actionsEnabled: boolean;
  businessLeads?: OperatorQueue["businessLeads"];
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
  const businessKey = item.business.kind === "workspace" ? `w:${item.business.workspaceId}` : item.business.kind === "tenant" ? `t:${item.business.tenantId}` : "strelva";
  const leadCount = businessLeads?.find(summary => summary.businessKey === businessKey);

  function mark(action: Parameters<typeof markQueueItemAction>[0]["action"], payload?: Record<string, unknown>) {
    start(async () => {
      const result = await markQueueItemAction({ commandId: newId(), key: item.key, action, payload });
      onResult(result);
      if (result.ok) { setPanel("none"); router.refresh(); }
    });
  }

  function openClose() {
    if (actionsEnabled && item.move === "owner") setCloseState("dismissed");
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
    <StRow align="start"
      lead={<StMono tone={item.priority === "P1" ? "critical" : item.priority === "P2" ? "need" : undefined}>{item.priority}</StMono>}
      kind={businessName(item.business)}
      title={<StTextButton tone="text" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Review ${item.title}`}>{item.title}</StTextButton>}
      detail={<>
        <span>{QUEUE_KIND_LABELS[item.kind]} · <StMono>{age(item.ageMs)}</StMono></span>
        {item.business.kind === "tenant" && <> · Not yet a workspace</>}
        {item.system && <> · {item.system.label}</>}
        {due && <> · {due}</>}
        {item.pinned && <> · Pinned</>}
        {late && <> · Late</>}
        <span className="block">{[item.priorityReason, reach].filter(Boolean).join(" · ")}</span>
      </>}
      end={<div className="flex flex-wrap items-center gap-4">
        <StState kind={item.move === "owner" ? "draft" : item.priority === "P1" ? "down" : "need"}>
          {item.assignee ? mine ? "You" : item.assignee.email ?? "Operator" : item.move === "owner" ? "Owner" : item.move === "provider" ? "Provider" : "Unassigned"}
        </StState>
        {mine
          ? <StTextButton disabled={pending} onClick={() => mark("release")}>Release</StTextButton>
          : <StTextButton disabled={pending} onClick={() => mark("take")}>Take</StTextButton>}
        <StTextButton href={item.href}>Open</StTextButton>
      </div>}>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[13px] text-gray-muted">{PRIORITY_LABELS[item.priority]}{leadCount && <> · {leadCount.lastSevenDays === null ? "Lead count unavailable" : `${leadCount.lastSevenDays} leads in 7 days`}</>}</p>
          <StTextButton disabled={pending} onClick={openClose}>Close</StTextButton>
          {actionsEnabled && <QueueSourceActions item={item} onResult={onResult} />}
          {actionsEnabled && item.kind === "draft_review" && item.review && hasQueueEventDetail(item.review) && <QueueEventDetail event={item.review} />}
          {actionsEnabled && item.kind === "draft_review" && item.move === "strelva" && <div className="mb-3 flex flex-wrap gap-2">
            {(["approve", "skip", "escalate"] as const).map((action) => <StPill variant="soft" key={action} disabled={pending} onClick={() => start(async () => {
              const result = await resolveQueueDraftsAction({ keys: [item.key], action });
              onResult(result); router.refresh();
            })}>{action === "approve" ? "Approve" : action === "skip" ? "Skip" : "Ask the owner"}</StPill>)}
          </div>}
          <div className="flex flex-wrap gap-1.5">
            <StPill variant="soft" disabled={pending} onClick={() => mark(item.pinned ? "unpin" : "pin")}>{item.pinned ? "Unpin" : "Pin for a day"}</StPill>
            <StPill variant="soft" disabled={pending || item.priority === "P1"} title={item.priority === "P1" ? "Harm-now items can't be snoozed" : undefined} onClick={() => setPanel("snooze")}>Snooze</StPill>
            <StPill variant="soft" disabled={pending} onClick={() => setPanel("note")}>Add note</StPill>
            {operators.length > 1 && <StPill variant="soft" disabled={pending} onClick={() => setPanel("handoff")}>Hand off</StPill>}
            {item.move === "owner" && <StPill variant="soft" disabled={pending} onClick={() => mark("owner_told", { via: "email" })}>Owner told by email</StPill>}
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
              <StPill variant="soft" type="submit" disabled={pending || !text.trim()}>Snooze</StPill>
            </form>
          )}
          {panel === "note" && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); mark("note", { body: text.trim() }); setText(""); }}>
              <div className="min-w-[200px] flex-1">
                <TextInput label="Note" value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} required />
              </div>
              <StPill variant="soft" type="submit" disabled={pending || !text.trim()}>Add note</StPill>
            </form>
          )}
          {panel === "handoff" && (
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); mark("hand_off", { assigneeUserId: handTo }); }}>
              <div className="min-w-[200px] flex-1">
                <SelectInput label="Hand to" value={handTo} onChange={(event) => setHandTo(event.target.value)} required
                  options={[{ value: "", label: "Choose an operator" }, ...operators.filter((operator) => operator.userId !== me).map((operator) => ({ value: operator.userId, label: operator.email }))]} />
              </div>
              <StPill variant="soft" type="submit" disabled={pending || !handTo}>Hand off</StPill>
            </form>
          )}
        </div>
      )}

      {panel === "close" && (
        <StSurface label={`Close ${item.title}`}><form onSubmit={submitClose} className="space-y-3" aria-label={`Close ${item.title}`}>
          <div className="flex flex-wrap items-end gap-2">
            <SelectInput label="Outcome" value={closeState} onChange={(event) => setCloseState(event.target.value as "done" | "dismissed")}
              options={actionsEnabled && item.move === "owner" ? [{ value: "dismissed", label: "Stop chasing" }] : [{ value: "done", label: "Done" }, { value: "dismissed", label: "Dismissed" }]} />
            <div className="min-w-[180px] flex-1">
              <TextInput label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} required={actionsEnabled} placeholder={closeState === "done" ? "What happened?" : "Why is it not needed?"} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-32">
              <TextInput label="Minutes on this?" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/[^\d]/g, ""))} disabled={!logMinutes} aria-describedby={`${item.key}-minutes-hint`} />
            </div>
            <label className="flex min-h-12 items-center gap-2 pb-2 text-[12px] text-gray-muted">
              <input type="checkbox" checked={logMinutes} onChange={(event) => setLogMinutes(event.target.checked)} className="accent-[var(--color-accent)]" />
              Log minutes
            </label>
            <div className="ml-auto flex gap-1.5">
              <StPill variant="soft" disabled={pending} onClick={() => setPanel("none")}>Cancel</StPill>
              <StPill variant="soft" type="submit" busy={pending} disabled={pending}>Close item</StPill>
            </div>
          </div>
          <p id={`${item.key}-minutes-hint`} className="mt-2 text-[12px] leading-5 text-gray-faint">
            Prefilled from the time this item was open in front of you. Edit or skip it.
            {item.business.kind !== "workspace" && " This business is not yet a workspace, so minutes can't be logged against it."}
          </p>
        </form></StSurface>
      )}
    </StRow>
  );
}

export function QueueBoard({ queue, me, actionsEnabled = false }: { queue: OperatorQueue; me: string; actionsEnabled?: boolean }) {
  const [message, setMessage] = useState<QueueActionResult | null>(null);
  const [showParked, setShowParked] = useState(false);
  const now = Date.parse(queue.generatedAt);
  const readyNow = (item: QueueItem) => item.pinned || item.priority === "P1" || item.move === "strelva";
  const current = queue.items.filter(readyNow);
  const waiting = queue.items.filter((item) => !readyNow(item));
  const groups = new Map<string, QueueItem[]>();
  for (const item of queue.items) {
    const key = item.business.kind === "workspace" ? item.business.workspaceId : item.business.kind === "tenant" ? item.business.tenantId : "strelva";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const rowProps = { me, operators: queue.operators, now, onResult: setMessage, actionsEnabled, businessLeads: queue.businessLeads };

  return (
    <div className="space-y-8">
      {!queue.complete && <StNotice tone="need">
        <p>This list is incomplete.</p>
        <ul>{queue.gaps.map((gap) => <li key={`${gap.kind}:${gap.source}`}>Couldn&apos;t read {gap.source.toLowerCase()} ({gap.reason}).</li>)}</ul>
      </StNotice>}
      {message && (message.ok ? <StToast>{message.message}</StToast> : <StNotice tone="critical">{message.message}</StNotice>)}

      <StSection title="Now" meta={<StMono>{current.length}</StMono>}>
        {current.length === 0
          ? <StEmpty>Nothing is harming a site or waiting on Strelva{queue.complete ? "." : " in the sources that could be read."}</StEmpty>
          : <StRows label="Now">{current.map((item) => <Row key={item.key} item={item} {...rowProps} />)}</StRows>}
      </StSection>

      <StSection title="Waiting on someone else" meta={<StMono>{waiting.length}</StMono>}>
        {waiting.length === 0
          ? <StEmpty>Nothing is waiting on an owner or provider{queue.complete ? "." : " in the sources that could be read."}</StEmpty>
          : <StRows label="Waiting on someone else">{waiting.map((item) => <Row key={item.key} item={item} {...rowProps} />)}</StRows>}
      </StSection>

      {actionsEnabled && [...groups.entries()].map(([key, items]) => <BulkDraftReview key={key} items={items} onResult={setMessage} />)}

      <StSection title="Closed and snoozed" meta={<StMono>{queue.parked.length}</StMono>}
        action={queue.parked.length ? <StTextButton onClick={() => setShowParked((value) => !value)} aria-expanded={showParked}>{showParked ? "Hide" : "Show"}</StTextButton> : undefined}>
        {!queue.parked.length && <StEmpty>No closed or snoozed items.</StEmpty>}
        {showParked && <StRows label="Closed and snoozed">{queue.parked.map((item) => <StRow key={item.key}
          kind={businessName(item.business)} title={item.title}
          detail={item.closedElsewhere ? `Closed by ${item.closedElsewhere.by}` : item.closed ? `${item.closed.state === "done" ? "Done" : "Dismissed"}${item.closed.reason ? `: ${item.closed.reason}` : ""}` : item.snoozed ? `Snoozed: ${item.snoozed.reason}` : ""}
          end={!item.closedElsewhere ? <ParkedAction item={item} onResult={setMessage} /> : undefined} />)}</StRows>}
      </StSection>
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
  return <div className="space-y-3">
    <StPill variant="soft" onClick={() => setOpen(!open)} aria-expanded={open}>Review {drafts.length} drafts together</StPill>
    {open && <div className="mt-3 space-y-3">
      {drafts.map((item) => <div key={item.key} className="space-y-2">
        <label className="flex min-h-12 items-center gap-2 text-[13px] text-warm-white"><input type="checkbox" checked={selected.includes(item.key)} disabled={pending} onChange={(event) => setSelected((keys) => event.target.checked ? [...keys, item.key] : keys.filter((key) => key !== item.key))} />{item.title}</label>
        {item.review && <QueueEventDetail event={item.review} />}
      </div>)}
      <StPill variant="soft" busy={pending} disabled={pending || !selected.length} onClick={() => start(async () => {
        const result = await resolveQueueDraftsAction({ keys: selected, action: "approve" }); onResult(result);
        setSelected((keys) => keys.filter((key) => !result.results.some((row) => row.key === key && row.changed))); router.refresh();
      })}>Approve {selected.length} reviewed drafts</StPill>
    </div>}
  </div>;
}

function ParkedAction({ item, onResult }: { item: QueueItem; onResult: (result: QueueActionResult) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const action = item.closed ? "reopen" : "unsnooze";
  return (
    <StPill variant="soft" disabled={pending} onClick={() => start(async () => {
      const result = await markQueueItemAction({ commandId: newId(), key: item.key, action });
      onResult(result);
      if (result.ok) router.refresh();
    })}>{item.closed ? "Reopen" : "Unsnooze"}</StPill>
  );
}
