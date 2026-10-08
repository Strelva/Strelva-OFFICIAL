"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { AgencyBrandEditor } from "./AgencyBrandEditor";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { AgencyEffect, AgencyOnboarding as Onboarding, AgencyOnboardingStep, AgencySummary } from "@/platform/workspaces/agency-onboarding";

/**
 * The agency setup checklist (#258). Creation goes through the ordinary
 * `create_agency` action; everything shown is read from
 * `GET /api/agency-onboarding`, which rechecks membership on every request.
 */

type State =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "choose"; agencies: AgencySummary[] }
  | { kind: "create" }
  | { kind: "ready"; onboarding: Onboarding };

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new RequestError(response.status, typeof body.error === "string" ? body.error : fallback);
  return body as T;
}

function failureState(error: unknown, fallback: string): State {
  if (error instanceof RequestError && error.status === 401) return { kind: "signed_out" };
  if (error instanceof RequestError && error.status === 403) return { kind: "unavailable" };
  return { kind: "error", message: error instanceof Error && error.message ? error.message : fallback };
}

export const AGENCY_EFFECT_COPY: Record<AgencyEffect, { name: string; unlocks: string }> = {
  publish: { name: "Publishing", unlocks: "Put a client’s website or domain live." },
  google: { name: "Google", unlocks: "Change a client’s Google Business Profile." },
  email: { name: "Email", unlocks: "Send email to a client’s owner or customers." },
  payments: { name: "Payments", unlocks: "Take payments on a client’s behalf." },
};

function rememberAgency(workspaceId: string) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ workspaceId }).toString();
  window.history.replaceState(window.history.state, "", url);
}

export function AgencyOnboarding({ initialWorkspaceId }: { initialWorkspaceId: string | null }) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [attempt, setAttempt] = useState(0);
  // Each read is stored with the key it was made for, so a change of agency or
  // a retry shows loading without resetting state inside the effect.
  const key = `${workspaceId ?? ""}:${attempt}`;
  const [stored, setStored] = useState<{ key: string; state: State } | null>(null);
  const state: State = stored?.key === key ? stored.state : { kind: "loading" };
  const setState = useCallback((next: State) => setStored({ key, state: next }), [key]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const settle = (next: State) => { if (!signal.aborted) setStored({ key, state: next }); };
    void (async () => {
      try {
        if (workspaceId) {
          const body = await readJson<{ onboarding: Onboarding }>(await fetch(`/api/agency-onboarding?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal }), "Your agency setup could not be loaded.");
          settle({ kind: "ready", onboarding: body.onboarding });
          return;
        }
        const body = await readJson<{ agencies: AgencySummary[] }>(await fetch("/api/agency-onboarding", { cache: "no-store", signal }), "Your agencies could not be loaded.");
        if (signal.aborted) return;
        if (body.agencies.length === 1) { rememberAgency(body.agencies[0]!.id); setWorkspaceId(body.agencies[0]!.id); return; }
        settle(body.agencies.length ? { kind: "choose", agencies: body.agencies } : { kind: "create" });
      } catch (error) {
        settle(failureState(error, "Your agency setup could not be loaded."));
      }
    })();
    return () => controller.abort();
  }, [key, workspaceId]);

  const open = (id: string) => { rememberAgency(id); setWorkspaceId(id); };
  const workspaceHref = workspaceId ? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` : "/workspace";

  return (
    <main data-dashboard className="min-h-dvh bg-surface-base px-6 py-12 text-warm-black md:px-8 lg:px-12">
      <div className="mx-auto max-w-[960px]">
        <a href={workspaceHref} className="inline-flex min-h-11 items-center gap-2 text-[13px] text-gray-muted underline-offset-4 hover:text-warm-black hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Your workspace</a>
        {state.kind === "loading" ? <p role="status" className="mt-16 flex items-center gap-2 text-[14px] text-gray-muted"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Loading your agency setup</p>
          : state.kind === "signed_out" ? <Notice title="Sign in to set up your agency." body="Use the email you want your agency account on. You come straight back here."><Link href="/sign-up?as=agency" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-medium text-on-accent hover:bg-accent/85">Sign in or create an account<ArrowRight className="size-4" aria-hidden="true" /></Link></Notice>
          : state.kind === "unavailable" ? <Notice title="This agency isn’t available to your account." body="Only members of an agency can see its setup. Ask its owner for an invitation, or create your own agency."><button type="button" onClick={() => { window.history.replaceState(window.history.state, "", window.location.pathname); setWorkspaceId(null); }} className="inline-flex min-h-11 items-center text-[14px] font-medium text-warm-black underline underline-offset-4">Go to your agencies</button></Notice>
          : state.kind === "error" ? <Notice title="Your agency setup didn’t load." body={state.message} alert><Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => setAttempt((value) => value + 1)}>Try again</Button></Notice>
          : state.kind === "choose" ? <ChooseAgency agencies={state.agencies} onOpen={open} onCreate={() => setState({ kind: "create" })} />
          : state.kind === "create" ? <CreateAgency onCreated={open} onSignedOut={() => setState({ kind: "signed_out" })} />
          : <Checklist onboarding={state.onboarding} workspaceHref={workspaceHref} />}
      </div>
    </main>
  );
}

function Notice({ title, body, alert, children }: { title: string; body: string; alert?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-16 max-w-xl" role={alert ? "alert" : undefined}>
      <h1 className="font-display text-[32px] font-medium leading-tight">{title}</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-gray-muted">{body}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ChooseAgency({ agencies, onOpen, onCreate }: { agencies: AgencySummary[]; onOpen: (id: string) => void; onCreate: () => void }) {
  return (
    <section className="mt-16 max-w-2xl" aria-labelledby="agency-choose-title">
      <h1 id="agency-choose-title" className="font-display text-[32px] font-medium leading-tight">Which agency are you setting up?</h1>
      <ul className="mt-8 divide-y divide-gray-border border-y border-gray-border">
        {agencies.map((agency) => <li key={agency.id}><button type="button" onClick={() => onOpen(agency.id)} className="flex min-h-16 w-full items-center gap-4 px-2 py-4 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"><Monogram name={agency.name} size="sm" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium">{agency.name}</strong><small className="mt-1 block text-[12px] capitalize text-gray-muted">{agency.role}</small></span><ArrowRight className="size-4 shrink-0 text-gray-muted" aria-hidden="true" /></button></li>)}
      </ul>
      <button type="button" onClick={onCreate} className="mt-5 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-warm-black underline-offset-4 hover:underline">Create another agency<ArrowRight className="size-4" aria-hidden="true" /></button>
    </section>
  );
}

function CreateAgency({ onCreated, onSignedOut }: { onCreated: (id: string) => void; onSignedOut: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter your agency’s name."); return; }
    setSubmitting(true); setError("");
    try {
      const body = await readJson<{ workspaceId: string }>(await fetch("/api/workspace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_agency", name: name.trim() }),
      }), "Your agency couldn’t be created.");
      onCreated(body.workspaceId);
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) { onSignedOut(); return; }
      setError(cause instanceof Error && cause.message ? cause.message : "Your agency couldn’t be created.");
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" aria-labelledby="agency-create-title">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent-text">New agency</p>
        <h1 id="agency-create-title" className="mt-3 font-display text-[40px] font-medium leading-tight">Name your agency.</h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">This creates your agency workspace, with you as its owner. It starts with no clients and no access to anyone else’s business.</p>
        <form onSubmit={submit} className="mt-8 max-w-md" noValidate>
          <TextInput label="Agency name" autoFocus required maxLength={120} autoComplete="organization" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="Northside Web Care" aria-invalid={error ? true : undefined} aria-describedby={error ? "agency-create-error" : undefined} />
          {error ? <p id="agency-create-error" role="alert" className="mt-3 text-[13px] text-critical">{error}</p> : null}
          <Button type="submit" size="lg" loading={submitting} className="mt-5" icon={<ArrowRight className="size-4" />}>Create agency</Button>
        </form>
      </div>
      <ul className="self-end border-t border-gray-border text-[13px] leading-relaxed text-gray-muted" aria-label="What happens next">
        <li className="border-b border-gray-border py-3">Invite the people who work with you.</li>
        <li className="border-b border-gray-border py-3">See what Strelva has verified your agency to do.</li>
        <li className="border-b border-gray-border py-3">Add your first client.</li>
      </ul>
    </section>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "A").slice(0, 2)).toUpperCase();
}

/** Compact agency initials for the chooser; the profile editor owns the public brand. */
function Monogram({ name, size }: { name: string; size: "sm" | "lg" }) {
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-border bg-surface font-medium text-gray-muted ${size === "lg" ? "size-16 text-[18px]" : "size-10 text-[13px]"}`}>{initials(name)}</span>;
}

const STEP_TITLES: Record<AgencyOnboardingStep["id"], string> = {
  profile: "Agency profile",
  team: "Invite your team",
  verification: "Verification",
  first_client: "Add your first client",
};

function StepMark({ step, next }: { step: AgencyOnboardingStep; next: boolean }) {
  if (step.done) return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-positive text-on-positive"><Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" /></span>;
  return <span className={`size-6 shrink-0 rounded-full border-2 ${next ? "border-accent-text" : "border-gray-border"}`} aria-hidden="true" />;
}

function stepStatus(step: AgencyOnboardingStep, next: boolean): string {
  if (step.done) return "Done";
  if (next) return "Next";
  if (step.id === "verification") return "Recorded by Strelva";
  return "Not started";
}

function Checklist({ onboarding, workspaceHref }: { onboarding: Onboarding; workspaceHref: string }) {
  const id = useId().replace(/:/g, "");
  const { agency } = onboarding;
  const done = onboarding.steps.filter((step) => step.done).length;
  const invitationsHref = `/workspace/invitations?workspaceId=${encodeURIComponent(agency.id)}`;
  const people = `${onboarding.members} ${onboarding.members === 1 ? "person" : "people"}`;
  const pending = onboarding.pendingInvitations ? ` · ${onboarding.pendingInvitations} ${onboarding.pendingInvitations === 1 ? "invitation" : "invitations"} pending` : "";

  const body: Record<AgencyOnboardingStep["id"], React.ReactNode> = {
    profile: <>
      {agency.role === "owner" ? <AgencyBrandEditor workspaceId={agency.id} /> : null}
      <p>{agency.name} is your agency’s name on Strelva.</p>
      <p className="mt-1">Your agency’s brand appears on owners’ emails, reports and workspace.</p>
    </>,
    team: <>
      <p>{onboarding.members === 1 && !onboarding.pendingInvitations ? "Just you so far." : `${people}${pending}.`} Teammates join your agency, never a client’s business directly.</p>
      {agency.role === "owner"
        ? <a href={invitationsHref} className="mt-3 inline-flex min-h-11 items-center gap-2 font-medium text-warm-black underline-offset-4 hover:underline">Invite a teammate<ArrowRight className="size-4" aria-hidden="true" /></a>
        : <p className="mt-1">Only an owner of {agency.name} can invite people.</p>}
    </>,
    verification: <>
      <p>Every agency starts unverified for each of these, Strelva’s own agency included. Strelva records verification one effect at a time, and there’s nothing to submit here. Until an effect is verified it stays off for your agency. Preparing work never needs it.</p>
      <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border" aria-labelledby={`${id}-verification`}>
        {onboarding.effects.map((effect) => <li key={effect.effect} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3 sm:grid-cols-[128px_minmax(0,1fr)_auto]">
          <span className="font-medium text-warm-black">{AGENCY_EFFECT_COPY[effect.effect].name}</span>
          <span className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">{AGENCY_EFFECT_COPY[effect.effect].unlocks}</span>
          <span className={`col-start-2 row-start-1 inline-flex items-center justify-end gap-1.5 whitespace-nowrap text-[12px] sm:col-start-3 ${effect.verified ? "text-positive" : "text-gray-muted"}`}><span className={`size-1.5 rounded-full ${effect.verified ? "bg-positive" : "border border-gray-muted"}`} aria-hidden="true" />{effect.verified ? "Verified" : "Not verified"}</span>
        </li>)}
      </ul>
    </>,
    first_client: onboarding.clients > 0
      ? <p>{onboarding.clients} {onboarding.clients === 1 ? "client has" : "clients have"} chosen {agency.name} as their provider.</p>
      : <>
        <p>Each client keeps ownership of their business. Your agency works inside the access they give it.</p>
        <p className="mt-2 font-medium text-warm-black">Adding clients opens here next.</p>
      </>,
  };

  return (
    <div className="mt-12">
      <header className="flex flex-col gap-5 border-b border-gray-border pb-8 sm:flex-row sm:items-center">
        <Monogram name={agency.name} size="lg" />
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent-text">Agency setup</p>
          <h1 className="mt-2 break-words font-display text-[32px] font-medium leading-tight sm:text-[40px]">{agency.name}</h1>
          <p className="mt-2 font-mono text-[12px] tabular-nums text-gray-muted" aria-live="polite">{done} of {onboarding.steps.length} done · {onboarding.verifiedEffects} of {onboarding.effects.length} effects verified</p>
        </div>
      </header>
      <ol className="divide-y divide-gray-border border-b border-gray-border">
        {onboarding.steps.map((step, index) => {
          const isNext = onboarding.next === step.id;
          const headingId = step.id === "verification" ? `${id}-verification` : `${id}-${step.id}`;
          return <li key={step.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-4 py-6 sm:grid-cols-[24px_minmax(0,1fr)_auto]" aria-current={isNext ? "step" : undefined}>
            <StepMark step={step} next={isNext} />
            <div className="min-w-0">
              <h2 id={headingId} className="text-[15px] font-medium leading-6"><span className="mr-2 font-mono text-[12px] text-gray-muted">{String(index + 1).padStart(2, "0")}</span>{STEP_TITLES[step.id]}</h2>
              <div className="mt-2 max-w-2xl text-[13px] leading-relaxed text-gray-muted">{body[step.id]}</div>
            </div>
            <p className={`col-start-2 row-start-2 mt-3 text-[12px] sm:col-start-3 sm:row-start-1 sm:mt-0 sm:text-right ${isNext ? "font-medium text-accent-text" : step.done ? "text-positive" : "text-gray-muted"}`}>{stepStatus(step, isNext)}</p>
          </li>;
        })}
      </ol>
      <a href={workspaceHref} className="mt-8 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-warm-black underline-offset-4 hover:underline">Open {agency.name}<ArrowRight className="size-4" aria-hidden="true" /></a>
    </div>
  );
}
