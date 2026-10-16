"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AgencyQualification } from "./AgencyQualification";
import type { QualificationState } from "./qualification-model";
import { StHead, StNotice, StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaButtonLink, XaWaiting, XaEntry, XaEntryCaption, XaEntryStack, XaField, XaHeadline, XaInitial, XaLabel, XaLede, XaPebbleScene, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import { AgencyDayOne } from "./AgencyDayOne";
import { AgencyFrame } from "./AgencyFrame";
import styles from "./agency-door.module.css";
import type { AgencyEffect, AgencyOnboarding as Onboarding, AgencySummary } from "@/platform/workspaces/agency-onboarding";

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
  return <AgencyOnboardingView state={state} addClient={addClient} workspaceId={workspaceId}
    onOpen={open} onRetry={() => setAttempt((value) => value + 1)} onCreateAnother={() => setState({ kind: "create" })}
    onClearAgency={() => { window.history.replaceState(window.history.state, "", window.location.pathname); setWorkspaceId(null); }}
    create={(name) => createAgency(name)} onSignedOut={() => setState({ kind: "signed_out" })} />;
}

export type AgencyOnboardingState = State;

async function createAgency(name: string): Promise<string> {
  const body = await readJson<{ workspaceId: string }>(await fetch("/api/workspace", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_agency", name }),
  }), "Your agency couldn’t be created.");
  return body.workspaceId;
}

/**
 * Every state of the agency door after sign-up (XA · A2, A3). Shared with the
 * fictional preview; the reads and the create action stay in AgencyOnboarding.
 */
export function AgencyOnboardingView({ state, addClient, workspaceId, onOpen, onRetry, onCreateAnother, onClearAgency, create, onSignedOut, preview }: {
  state: State; addClient: boolean; workspaceId: string | null;
  onOpen: (id: string) => void; onRetry: () => void; onCreateAnother: () => void; onClearAgency: () => void;
  create: (name: string) => Promise<string>; onSignedOut: () => void;
  /** Fictional preview only: where the frame's links go, and the light or dark mode. */
  preview?: { appBase: string; hrefs?: Partial<Record<"home" | "clients" | "queue" | "library" | "team" | "verification" | "minutes", string>>; addClientHref?: string; mode?: "light" | "dark"; notice?: ReactNode; accountName?: string };
}) {
  const workspaceHref = workspaceId ? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` : "/workspace";
  const corner = <a href={preview ? "#" : workspaceHref}>Your agency</a>;
  const mode = preview?.mode;
  if (state.kind === "ready") return <Checklist onboarding={state.onboarding} workspaceHref={workspaceHref} addClient={addClient} preview={preview} />;
  if (state.kind === "create") return <CreateAgency onCreated={onOpen} onSignedOut={onSignedOut} create={create} corner={corner} mode={mode} />;
  if (state.kind === "loading") return <XaEntry corner={corner} mode={mode}><div aria-busy="true"><StSkeleton label="Loading your agency setup" /><StSkeleton width="70%" /></div></XaEntry>;
  if (state.kind === "signed_out") return <XaEntry corner={corner} mode={mode}><XaEntryStack>
    <XaHeadline quiet="Use the email you want your agency account on. You come straight back here.">Sign in to set up your agency.</XaHeadline>
    <XaButtonLink variant="primary" size="lg" block href="/sign-up?as=agency">Sign in or create an account</XaButtonLink>
  </XaEntryStack></XaEntry>;
  if (state.kind === "unavailable") return <XaEntry corner={corner} mode={mode}><XaEntryStack>
    <XaHeadline quiet="Only members of an agency can see its setup. Ask its owner for an invitation, or make your own agency.">This agency isn’t open to your account.</XaHeadline>
    <XaButton size="lg" onClick={onClearAgency}>Go to your agencies</XaButton>
  </XaEntryStack></XaEntry>;
  if (state.kind === "error") return <XaEntry corner={corner} mode={mode} aside={<><XaPebbleScene pose="fixing" size={320} bare label="Pebble checking the connection" /><XaEntryCaption title="Nothing about your agency changed.">Reading it again usually works.</XaEntryCaption></>}><XaEntryStack>
    <XaHeadline quiet={state.message}>Your agency setup didn’t load.</XaHeadline>
    <XaButton variant="primary" size="lg" onClick={onRetry}><RefreshCw className="size-4" aria-hidden="true" />Try again</XaButton>
  </XaEntryStack></XaEntry>;
  return <ChooseAgency agencies={state.agencies} onOpen={onOpen} onCreate={onCreateAnother} corner={corner} mode={mode} />;
}

function ChooseAgency({ agencies, onOpen, onCreate, corner, mode }: { agencies: AgencySummary[]; onOpen: (id: string) => void; onCreate: () => void; corner: ReactNode; mode?: "light" | "dark" }) {
  return <XaEntry corner={corner} mode={mode}><XaEntryStack>
    <XaHeadline quiet="You belong to more than one.">Which agency are you setting up?</XaHeadline>
    <XaRows label="Your agencies">{agencies.map(agency => <XaRow key={agency.id} lead={<XaInitial name={agency.name} size={32} />} title={agency.name} detail={ROLE_WORDS[agency.role] ?? agency.role} meta={<ArrowRight size={16} aria-hidden="true" />} onClick={() => onOpen(agency.id)} />)}</XaRows>
    <p className="text-[14px]"><XaTextLink onClick={onCreate}>Make another agency</XaTextLink></p>
  </XaEntryStack></XaEntry>;
}

const ROLE_WORDS: Record<string, string> = { owner: "You own it", admin: "You’re an admin", member: "You’re a member" };

/** XA · A2. The name appears in the preview as it is typed, because that is the promise: clients see it. */
function CreateAgency({ onCreated, onSignedOut, create, corner, mode }: { onCreated: (id: string) => void; onSignedOut: () => void; create: (name: string) => Promise<string>; corner: ReactNode; mode?: "light" | "dark" }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const shown = name.trim() || "Your agency";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter your agency’s name."); return; }
    setSubmitting(true); setError("");
    try {
      onCreated(await create(name.trim()));
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) { onSignedOut(); return; }
      setError(cause instanceof Error && cause.message ? cause.message : "Your agency couldn’t be created.");
      setSubmitting(false);
    }
  }

  return <XaEntry corner={corner} mode={mode} aside={<div className={styles.seen}>
    <XaLabel>How a client sees you, for example Dr. Lin at Harbor Dental</XaLabel>
    <div className={styles.seenComposer} inert aria-hidden="true">
      <XaWaiting item={{ kicker: <>Waits for you · from {shown}</>, title: "New wording for your Fees page", from: { name: shown, color: "#2f5236" }, action: null }} />
    </div>
    <p className={styles.seenNote}>Prepared by {shown} · Runs on Strelva</p>
  </div>}>
    <form onSubmit={submit} noValidate aria-labelledby="agency-create-title"><XaEntryStack>
      <div className="flex flex-col gap-2"><XaHeadline id="agency-create-title" size="sm">Name your agency.</XaHeadline><XaLede>Clients see it on every change you prepare.</XaLede></div>
      <XaField label="Agency name" autoFocus required maxLength={120} autoComplete="organization" value={name} placeholder="North Studio"
        onChange={(event) => { setName(event.target.value); setError(""); }} error={error || undefined} />
      <XaButton type="submit" variant="primary" size="lg" block busy={submitting}>{name.trim() ? `Create ${name.trim()}` : "Create your agency"}</XaButton>
      <div className="flex flex-col gap-2">
        <XaLabel id="agency-after">After this</XaLabel>
        <ul aria-labelledby="agency-after" className={styles.after}>
          <li>Invite the people who work with you.</li>
          <li>Get verified for client work.</li>
          <li>Add your first client. It starts with no access to anyone else’s business.</li>
        </ul>
      </div>
    </XaEntryStack></form>
  </XaEntry>;
}

/** Qualification is effect-scoped; evidence never grants client authority. */
export function AgencyVerification({ onboarding, fictionalQualification, headingLevel = "h1" }: { onboarding: Pick<Onboarding, "agency" | "effects">; fictionalQualification?: QualificationState; headingLevel?: "h1" | "h2" }) {
  return <>
    <StHead as={headingLevel} title="Get verified for client work" meta="Show how your agency safely publishes websites, updates Google, sends email or handles payments. An independent platform reviewer checks your evidence." />
    <StNotice>Verification confirms what your agency can do safely. Client permissions, owner decisions and release settings still apply. Every agency follows the same review.</StNotice>
    <AgencyQualification workspaceId={onboarding.agency.id} fictionalQualification={fictionalQualification} />
  </>;
}

/** XA · A3 inside the agency's frame. Verification opens in place under the sentences, never in a modal. */
function Checklist({ onboarding, workspaceHref, addClient, preview }: { onboarding: Onboarding; workspaceHref: string; addClient: boolean; preview?: { appBase: string; hrefs?: Partial<Record<"home" | "clients" | "queue" | "library" | "team" | "verification" | "minutes", string>>; addClientHref?: string; mode?: "light" | "dark"; notice?: ReactNode; accountName?: string } }) {
  const { agency } = onboarding;
  const [verifying, setVerifying] = useState(false);
  const canAdd = addClient && agency.role !== "member";
  const addHref = preview?.addClientHref ?? `/workspace/agency/clients/new?workspaceId=${encodeURIComponent(agency.id)}`;
  return <AgencyFrame agencyWorkspaceId={preview ? undefined : agency.id} agencyName={agency.name} title="Home" accountName={preview?.accountName} appBase={preview?.appBase} hrefs={preview?.hrefs} mode={preview?.mode} notice={preview?.notice} signOut={preview ? null : undefined} active={verifying ? "verification" : "home"}>
    <AgencyDayOne agencyName={agency.name} viewerFirstName={onboarding.viewer?.firstName} clients={onboarding.clients} openAgencyHref={preview?.hrefs?.home ?? workspaceHref}
      addClientHref={canAdd ? addHref : null} addClientBlocked={addClient ? `An owner or admin of ${agency.name} adds clients.` : "Adding clients opens here next."}
      verification={{ verified: onboarding.verifiedEffects, total: onboarding.effects.length || AGENCY_EFFECT_TOTAL, onOpen: () => setVerifying(value => !value), open: verifying }}
      team={{ members: onboarding.members, pending: onboarding.pendingInvitations, inviteHref: agency.role === "owner" ? preview ? "#" : `/workspace/invitations?workspaceId=${encodeURIComponent(agency.id)}` : null, ownerOnly: `Only an owner of ${agency.name} invites people.` }}
      brandHref={agency.role === "owner" ? preview ? "#" : `${workspaceHref}&agencyView=team#agency-brand` : null}>
      {verifying ? <section className={styles.inPlace} aria-label="Verification"><AgencyVerification onboarding={onboarding} headingLevel="h2" /></section> : null}
    </AgencyDayOne>
  </AgencyFrame>;
}

const AGENCY_EFFECT_TOTAL = Object.keys(AGENCY_EFFECT_COPY).length;
