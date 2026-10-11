"use client";

import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { StEmpty, StNotice, StPill, StRow, StRows, StSegmented, StSkeleton, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { TextInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { bookingServicePolicySchema } from "@/platform/bookings/service-policy-schema";

const range = z.object({ day: z.number().int().min(0).max(6), opens: z.string(), closes: z.string() });
const settingsSchema = z.object({ mode: z.enum(["request", "instant"]), bufferMinutes: z.number().int().min(0).max(120), minNoticeMinutes: z.number().int().min(0).max(43200), maxAdvanceDays: z.number().int().min(1).max(60), maxPerDay: z.number().int().min(1).max(1000).nullable(), revision: z.number().int().min(1), cancellationCutoffHours: z.number().int().min(0).max(168).optional() });
const contextSchema = z.object({ settings: settingsSchema.nullable(), services: z.array(z.object({ id: z.string(), name: z.string(), durationMinutes: z.number().nullable(), active: z.boolean() })), servicePolicies: z.array(bookingServicePolicySchema).optional(), hours: z.object({ timezone: z.string(), weekly: z.array(range) }).nullable(), paused: z.boolean() });
const receiptSchema = z.object({ revision: z.number().int().min(1), mode: z.literal("request"), approvalRequired: z.boolean() });
type Context = z.infer<typeof contextSchema>;
type Phase = "idle" | "loading" | "ready" | "sending" | "permission" | "error" | "unknown" | "saved";
type Draft = { mode: "request" | "instant"; buffer: string; notice: string; advance: string; cap: string; cutoff: string; services: z.infer<typeof bookingServicePolicySchema>[] };
const modes = [{ value: "request", label: "Owner confirms each one" }, { value: "instant", label: "Book instantly" }] as const;
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Exact existing booking setup command. No retries after an unknown write; a fresh read is required. */
export function BookingRulesPanel({ workspaceId, tenantId, calendarHealth }: { workspaceId: string; tenantId: string; calendarHealth?: string }) {
  const request = useWorkspaceRequest();
  const locked = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [context, setContext] = useState<Context | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [editing, setEditing] = useState(false);
  const busy = phase === "loading" || phase === "sending";

  async function load() {
    if (locked.current) return;
    locked.current = true; setPhase("loading"); setError(""); setEditing(false);
    try {
      const response = await request(`/api/workspace/bookings/settings?${new URLSearchParams({ workspaceId, tenantId })}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) { setPhase("permission"); return; }
      if (!response.ok) throw new Error(body?.error || "Booking rules could not be read. Nothing changed.");
      const parsed = contextSchema.safeParse(body);
      if (!parsed.success) throw new Error("Booking rules could not be verified. Nothing changed.");
      setContext(parsed.data);
      const settings = parsed.data.settings;
      setDraft(settings ? { mode: settings.mode, buffer: String(settings.bufferMinutes), notice: String(settings.minNoticeMinutes), advance: String(settings.maxAdvanceDays), cap: settings.maxPerDay === null ? "" : String(settings.maxPerDay), cutoff: settings.cancellationCutoffHours === undefined ? "" : String(settings.cancellationCutoffHours), services: parsed.data.servicePolicies ?? [] } : null);
      setPhase("ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Booking rules could not be read."); setPhase("error"); }
    finally { locked.current = false; }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current || phase !== "ready" || !draft || !context?.settings) return;
    const number = (value: string) => value.trim() && /^\d+$/.test(value) ? Number(value) : NaN;
    const commandSchema = settingsSchema.omit({ revision: true }).extend({ cancellationCutoffHours: z.number().int().min(0).max(168) });
    const parsed = commandSchema.safeParse({ mode: draft.mode, bufferMinutes: number(draft.buffer), minNoticeMinutes: number(draft.notice), maxAdvanceDays: number(draft.advance), maxPerDay: draft.cap.trim() ? number(draft.cap) : null, cancellationCutoffHours: number(draft.cutoff) });
    if (!parsed.success) { setError("Check the buffer, notice, advance window, daily limit and cancellation cutoff."); return; }
    // Capture one immutable submission before awaiting anything. Existing service intake and availability are carried through.
    const command = JSON.stringify({ workspaceId, tenantId, expectedRevision: context.settings.revision, ...parsed.data, ...(draft.services.length ? { services: draft.services } : {}) });
    locked.current = true; setPhase("sending"); setError(""); setReceipt("");
    try {
      const response = await request("/api/workspace/bookings/settings", { method: "POST", headers: { "content-type": "application/json" }, body: command });
      const body = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) { setPhase("permission"); return; }
      if (response.status === 400 || response.status === 409 || response.status === 429) { setError(body?.error || "The rules changed. Read the current rules before saving again."); setPhase("error"); return; }
      const parsedReceipt = receiptSchema.safeParse(body);
      if (!response.ok || !parsedReceipt.success) { setError("The save could not be confirmed. Read the current rules before making another change."); setPhase("unknown"); return; }
      setReceipt(parsedReceipt.data.approvalRequired ? "Rules saved in request mode. Instant booking still needs the owner’s approval in Needs you." : "Rules saved. The owner confirms new booking requests.");
      setPhase("saved"); setEditing(false);
    } catch { setError("The save could not be confirmed. Read the current rules before making another change."); setPhase("unknown"); }
    finally { locked.current = false; }
  }

  if (phase === "idle") return <StTextButton onClick={() => void load()}>How sessions get booked</StTextButton>;
  return <section className="space-y-4 border-t border-gray-border py-4" aria-label="Booking rules" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">How sessions get booked</h3>{phase === "ready" && context?.settings ? <StTextButton onClick={() => { setEditing(!editing); setError(""); }}>Change rules</StTextButton> : null}</div>
    {phase === "loading" ? <><StSkeleton label="Reading booking rules" width="60%" /><StSkeleton width="80%" /></> : null}
    {phase === "permission" ? <StNotice tone="critical">Sign in as this business&apos;s owner or an admin to read and change booking rules.</StNotice> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {context && phase !== "permission" && phase !== "loading" && phase !== "saved" ? <>
      {context.paused ? <StNotice>Bookings are paused. Existing bookings are kept.</StNotice> : null}
      {!context.settings ? <StEmpty>No booking rules have been prepared yet. Ask Strelva to prepare them.</StEmpty> : <StRows>
        <StRow kind="Default booking mode" title={context.settings.mode === "request" ? "Owner confirms each one" : "Book instantly"} detail="Each session’s own rule takes priority when one is recorded." />
        {context.services.filter(service => service.active).map(service => { const policy = context.servicePolicies?.find(item => item.businessServiceId === service.id); return <StRow key={service.id} kind="Session · from the business record" title={service.name} detail={`${service.durationMinutes === null ? "Length unavailable" : `${service.durationMinutes} minutes`} · ${policy ? policy.bookable ? policy.mode === "request" ? "Owner confirms each one" : "Book instantly" : "Not offered" : "Uses the default booking rule"}${policy ? ` · ${policy.bufferMinutes} minute buffer` : ""}`} />; })}
        <StRow kind="When" title={context.hours ? context.hours.weekly.map(range => `${days[range.day]} ${range.opens}–${range.closes}`).join(" · ") || "No open hours recorded" : "Opening hours unavailable"} detail={`${context.settings.minNoticeMinutes} minutes’ minimum notice · up to ${context.settings.maxAdvanceDays} days ahead`} />
        <StRow kind="Between sessions" title={`${context.settings.bufferMinutes} minute default buffer`} detail={context.settings.maxPerDay === null ? "No daily cap recorded" : `${context.settings.maxPerDay} per day at most`} />
        <StRow kind="Calendar" title={calendarHealth === "connected" ? "Connected" : calendarHealth === "reconnect" ? "Needs reconnection" : calendarHealth === "not_connected" ? "Not connected" : "Calendar status unavailable"} detail="Calendar name and last availability check are unavailable in this record." />
        <StRow kind="Reminders" title="Reminder settings unavailable in this record" detail="Reminder delivery cannot be confirmed here." />
        <StRow kind="Cancellation cutoff" title={context.settings.cancellationCutoffHours === undefined ? "Current cutoff unavailable in this record" : `${context.settings.cancellationCutoffHours} hours before`} />
      </StRows>}
      {editing && draft ? <StSurface label="Change booking rules"><form onSubmit={event => void save(event)} className="space-y-4">
        <p className="text-sm text-gray-muted">Saving returns bookings to request mode. Instant booking takes effect only after the owner approves the exact new rules in Needs you.</p>
        <fieldset disabled={busy || phase !== "ready"} className="space-y-4">
          {draft.services.length ? draft.services.map((policy, index) => <div key={policy.businessServiceId}><p className="mb-2 text-sm font-medium">{context.services.find(service => service.id === policy.businessServiceId)?.name ?? "Recorded session"}</p><StSegmented label={`Booking mode for ${context.services.find(service => service.id === policy.businessServiceId)?.name ?? "recorded session"}`} value={policy.mode} options={modes} onChange={mode => setDraft(current => current ? { ...current, services: current.services.map((item, itemIndex) => itemIndex === index ? { ...item, mode } : item) } : current)} /></div>) : <StSegmented label="Default booking mode" value={draft.mode} options={modes} onChange={mode => setDraft(current => current ? { ...current, mode } : current)} />}
          <div className="grid gap-4 sm:grid-cols-2">{([{ key: "buffer", label: "Default buffer (minutes)", max: 120, min: 0 }, { key: "notice", label: "Minimum notice (minutes)", max: 43200, min: 0 }, { key: "advance", label: "Book up to (days ahead)", max: 60, min: 1 }, { key: "cap", label: "Daily limit (optional)", max: 1000, min: 1 }, { key: "cutoff", label: "Cancellation cutoff (hours before)", max: 168, min: 0 }] as const).map(field => <TextInput key={field.key} label={field.label} type="number" min={field.min} max={field.max} step={1} required={field.key !== "cap"} value={draft[field.key]} onChange={event => setDraft(current => current ? { ...current, [field.key]: event.target.value } : current)} />)}</div>
          {context.settings?.cancellationCutoffHours === undefined ? <p className="text-sm text-gray-muted">The current cancellation cutoff could not be read. Choose it explicitly to save these rules.</p> : null}
          <div className="flex flex-wrap gap-3"><StPill type="submit" busy={phase === "sending"} disabled={phase !== "ready"}>Save rules</StPill><StTextButton disabled={busy} onClick={() => setEditing(false)}>Keep current rules</StTextButton></div>
        </fieldset>
      </form></StSurface> : null}
    </> : null}
    {receipt ? <StToast>{receipt}</StToast> : null}
    {!busy && phase !== "permission" ? <StTextButton onClick={() => void load()}>Read current rules</StTextButton> : null}
  </section>;
}
