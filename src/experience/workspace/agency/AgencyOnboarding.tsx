"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AgencyQualification } from "./AgencyQualification";
import type { QualificationState } from "./qualification-model";
import { StHead, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSection, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
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

export function AgencyOnboarding({ initialWorkspaceId, addClient = false }: { initialWorkspaceId: string | null; addClient?: boolean }) {
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
    <main data-workspace-theme="linen" className="min-h-dvh bg-canvas text-warm-black"><StPage>
        <StTextButton href={workspaceHref}>Your workspace</StTextButton>
        {state.kind === "loading" ? <StSkeleton label="Loading your agency setup" />
          : state.kind === "signed_out" ? <Notice title="Sign in to set up your agency." body="Use the email you want your agency account on. You come straight back here."><StPillLink href="/sign-up?as=agency">Sign in or create an account</StPillLink></Notice>
          : state.kind === "unavailable" ? <Notice title="This agency isn’t available to your account." body="Only members of an agency can see its setup. Ask its owner for an invitation, or create your own agency."><button type="button" onClick={() => { window.history.replaceState(window.history.state, "", window.location.pathname); setWorkspaceId(null); }} className="inline-flex min-h-11 items-center text-[14px] font-medium text-warm-black underline underline-offset-4">Go to your agencies</button></Notice>
          : state.kind === "error" ? <Notice title="Your agency setup didn’t load." body={state.message} alert><StPill variant="soft" onClick={() => setAttempt((value) => value + 1)}><RefreshCw className="size-4" />Try again</StPill></Notice>
          : state.kind === "choose" ? <ChooseAgency agencies={state.agencies} onOpen={open} onCreate={() => setState({ kind: "create" })} />
          : state.kind === "create" ? <CreateAgency onCreated={open} onSignedOut={() => setState({ kind: "signed_out" })} />
          : <Checklist onboarding={state.onboarding} workspaceHref={workspaceHref} addClient={addClient} />}
      </StPage>
    </main>
  );
}

function Notice({ title, body, alert, children }: { title: string; body: string; alert?: boolean; children: React.ReactNode }) {
  return <><StHead title={title} /><StNotice tone={alert ? "critical" : undefined}>{body}</StNotice>{children}</>;
}

function ChooseAgency({ agencies, onOpen, onCreate }: { agencies: AgencySummary[]; onOpen: (id: string) => void; onCreate: () => void }) {
  return <><StHead title="Which agency are you setting up?" /><StRows>{agencies.map(agency => <StRow key={agency.id} title={agency.name} detail={agency.role} onClick={() => onOpen(agency.id)} end={<ArrowRight size={16} aria-hidden="true" />} />)}</StRows><StTextButton onClick={onCreate}>Create another agency</StTextButton></>;
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
        <StHead titleId="agency-create-title" title="Name your agency" meta="This creates your agency workspace, with you as its owner. It starts with no clients and no access to anyone else’s business." />
        <StSurface label="Create agency"><form onSubmit={submit} className="max-w-md" noValidate>
          <TextInput label="Agency name" autoFocus required maxLength={120} autoComplete="organization" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="Northside Web Care" aria-invalid={error ? true : undefined} aria-describedby={error ? "agency-create-error" : undefined} />
          {error ? <p id="agency-create-error" role="alert" className="mt-3 text-[13px] text-critical">{error}</p> : null}
          <div className="mt-5"><StPill type="submit" size="lg" busy={submitting}>Create agency<ArrowRight className="size-4" /></StPill></div>
        </form></StSurface>
      </div>
      <ul className="self-end border-t border-gray-border text-[13px] leading-relaxed text-gray-muted" aria-label="What happens next">
        <li className="border-b border-gray-border py-3">Invite the people who work with you.</li>
        <li className="border-b border-gray-border py-3">See what Strelva has verified your agency to do.</li>
        <li className="border-b border-gray-border py-3">Add your first client.</li>
      </ul>
    </section>
  );
}

const STEP_TITLES: Record<AgencyOnboardingStep["id"], string> = {
  profile: "Agency profile", team: "Invite your team", verification: "Verification", first_client: "Add your first client",
};

/** Qualification is effect-scoped; evidence never grants client authority. */
export function AgencyVerification({ onboarding, fictionalQualification }: { onboarding: Pick<Onboarding, "agency" | "effects">; fictionalQualification?: QualificationState }) {
  return <>
    <StHead title="Get verified for client work" meta="Show how your agency safely publishes websites, updates Google, sends email or handles payments. An independent platform reviewer checks your evidence." />
    <StNotice>Verification confirms what your agency can do safely. Client permissions, owner decisions and release settings still apply. Every agency follows the same review.</StNotice>
    <AgencyQualification workspaceId={onboarding.agency.id} fictionalQualification={fictionalQualification} />
  </>;
}

function Checklist({ onboarding, workspaceHref, addClient }: { onboarding: Onboarding; workspaceHref: string; addClient: boolean }) {
  const { agency } = onboarding;
  const done = onboarding.steps.filter(step => step.done).length;
  return <>
    <StHead title={agency.name} meta={`${done} of ${onboarding.steps.length} setup steps done · ${onboarding.verifiedEffects} of ${onboarding.effects.length} effects verified`} />
    <StSection title="Agency profile">
      {agency.role === "owner" ? <StTextButton href={`${workspaceHref}&agencyView=team#agency-brand`}>Edit agency brand</StTextButton> : null}
      <p className="text-sm text-gray-muted">{agency.name} is your agency’s name on Strelva. Your agency’s brand appears on owners’ emails, reports and workspace.</p>
    </StSection>
    <StSection title={STEP_TITLES.team}>
      <p className="text-sm text-gray-muted">{onboarding.members === 1 && !onboarding.pendingInvitations ? "Just you so far." : `${onboarding.members} people${onboarding.pendingInvitations ? ` · ${onboarding.pendingInvitations} invitations pending` : ""}.`} Teammates join your agency, never a client’s business directly.</p>
      {agency.role === "owner" ? <StTextButton href={`/workspace/invitations?workspaceId=${encodeURIComponent(agency.id)}`}>Invite a teammate</StTextButton> : <StNotice>Only an owner of {agency.name} can invite people.</StNotice>}
    </StSection>
    <AgencyVerification onboarding={onboarding} />
    <StSection title={STEP_TITLES.first_client}>
      {onboarding.clients > 0 ? <p className="text-sm text-gray-muted">{onboarding.clients} {onboarding.clients === 1 ? "client has" : "clients have"} chosen {agency.name} as their agency.</p> : <>
        <p className="text-sm text-gray-muted">Each client keeps ownership of their business. Your agency works inside the access they give it.</p>
        {addClient && agency.role !== "member" ? <StTextButton href={`/workspace/agency/clients/new?workspaceId=${encodeURIComponent(agency.id)}`}>Add your first client</StTextButton> : <StNotice>{addClient ? `An owner or admin of ${agency.name} adds clients.` : "Adding clients opens here next."}</StNotice>}
      </>}
    </StSection>
    <StPillLink href={workspaceHref}>Open {agency.name}</StPillLink>
  </>;
}
