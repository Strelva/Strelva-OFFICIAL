"use client";
/**
 * XA · R3 People, R4 What the agency can do, R5 Remove the agency.
 *
 * Who can open a business comes from the access review (`read_access_review`):
 * members, the agency of record (`provider`), agency seats and assignments,
 * read-only shares and assistant connections, each with whether this person
 * may end it. Removing goes through the same revoke the review uses, so SQL
 * still decides. An agency the review won't let you drop directly (a provider
 * change policy or an open handoff) goes to the agency handoff instead.
 * Invitations make a private link; Strelva never emails it.
 *
 * There is no per-capability agency switch in the platform yet, so R4 says
 * what the agency's access actually allows, without toggles that would do
 * nothing.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import {
  XaAnswers, XaButton, XaButtonLink, XaField, XaHeadline, XaInitial, XaLabel, XaSays, XaSheet, XaTextLink,
} from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { accessReviewSchema, type AccessReview } from "@/platform/access-review/contracts";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";
import { RecordTrouble } from "./RecordStates";
import styles from "./record.module.css";

type Entry = AccessReview["units"][number]["entries"][number];
type Role = "owner" | "admin" | "member";
type Invitation = { id: string; recipientEmail: string; role: Role; status: "pending" | "accepted" | "revoked" | "expired"; expiresAt: string; createdAt: string };
export type PeoplePoster = <T>(action: { action: "revoke_delegation"; delegationId: string }, fallback: string) => Promise<T>;

const ROLE_WORD: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const AGENCY_COLOR = "#2f5236";

async function json<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : fallback);
  return body;
}

function listNames(names: readonly string[]) {
  return names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function dateWord(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "soon" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function PeopleAndAccess({ snapshot, currentRole, request, postAction, onChanged, initialAgency, initialRemoving = false }: {
  snapshot: WorkspaceSnapshot;
  currentRole?: Role;
  request: typeof fetch;
  postAction: PeoplePoster;
  onChanged?: () => void;
  /** Preview and deep links: open this agency's page (R4) first. */
  initialAgency?: string;
  /** Preview: open the remove sheet (R5) on the agency page. */
  initialRemoving?: boolean;
}) {
  const workspaceId = snapshot.workspaceId;
  const businessName = snapshot.workspaces.find(workspace => workspace.id === workspaceId)?.name || "this business";
  const owner = currentRole === "owner";
  const [review, setReview] = useState<AccessReview["units"][number] | null>(null);
  const [reviewState, setReviewState] = useState<"loading" | "ready" | "error">("loading");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [agencyId, setAgencyId] = useState<string | null>(initialAgency ?? null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    void request(`/api/workspace/access-review?${new URLSearchParams({ workspaceId })}`, { credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("People couldn't be read.");
        const parsed = accessReviewSchema.parse(await response.json());
        // Fail closed: a review for any other scope names nobody here.
        if (parsed.workspaceId !== workspaceId || parsed.organization || parsed.units.length !== 1 || parsed.units[0]?.workspaceId !== workspaceId) throw new Error("Access belongs to another workspace");
        if (!controller.signal.aborted) { setReview(parsed.units[0]!); setReviewState("ready"); }
      }).catch(() => { if (!controller.signal.aborted) { setReview(null); setReviewState("error"); } });
    if (owner) void request(`/api/workspace-invitations?${new URLSearchParams({ workspaceId })}`, { cache: "no-store", signal: controller.signal })
      .then(response => json<{ invitations?: Invitation[] }>(response, "Invitations couldn't be read."))
      .then(body => { if (!controller.signal.aborted) setInvitations(Array.isArray(body.invitations) ? body.invitations : []); })
      .catch(() => { if (!controller.signal.aborted) setInvitations([]); });
    return () => controller.abort();
  }, [request, workspaceId, owner, reload, snapshot.actor.email]);

  const entries = review?.entries ?? [];
  const members = entries.filter(entry => entry.kind === "member");
  const agencies = entries.filter(entry => entry.kind === "provider" && entry.status === "active");
  const seats = entries.filter(entry => entry.kind === "provider_seat" && entry.status === "active");
  const assigned = entries.filter(entry => (entry.kind === "agency_assignment" || entry.kind === "operational_assignment") && entry.status === "active");
  const assistants = entries.filter(entry => entry.kind === "agent_token" && entry.status === "active");
  const agencyNames = Object.fromEntries(entries.filter(entry => entry.kind === "delegation").map(entry => [entry.id, entry.label]));

  const revoke = useCallback(async (entry: Entry, done: string) => {
    setBusy(`${entry.kind}:${entry.id}`); setFailure(null); setSaid(null);
    try {
      const response = await request("/api/workspace/access-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, organization: false, businessId: workspaceId, kind: entry.kind, recordId: entry.id }) });
      const result = await json<{ ok?: boolean; changed?: boolean }>(response, "That access couldn't be removed.");
      if (result.ok !== true) throw new Error("That access couldn't be removed.");
      if (!alive.current) return false;
      setSaid(result.changed ? done : "That access was already gone.");
      setReload(value => value + 1); onChanged?.();
      return true;
    } catch (cause) { if (alive.current) setFailure(cause instanceof Error ? cause.message : "That access couldn't be removed."); return false; }
    finally { if (alive.current) setBusy(null); }
  }, [request, workspaceId, onChanged]);

  async function stopSharing(delegationId: string, name: string) {
    setBusy(`delegation:${delegationId}`); setFailure(null); setSaid(null);
    try { await postAction<{ ok: true }>({ action: "revoke_delegation", delegationId }, "Sharing couldn't be stopped."); if (!alive.current) return; setSaid(`${name} no longer sees that work. Your copy stays here.`); onChanged?.(); }
    catch (cause) { if (alive.current) setFailure(cause instanceof Error ? cause.message : "Sharing couldn't be stopped."); }
    finally { if (alive.current) setBusy(null); }
  }

  const agency = agencyId ? agencies.find(entry => entry.id === agencyId) ?? null : null;
  if (agencyId && reviewState === "ready" && agency) return <AgencyPage agency={agency} businessName={businessName} seats={seats} assigned={assigned} owner={owner} workspaceId={workspaceId}
    busy={busy === `provider:${agency.id}`} failure={failure} initialRemoving={initialRemoving}
    onBack={() => { setAgencyId(null); setFailure(null); }}
    onRemove={async () => { const ok = await revoke(agency, `${agency.label} no longer has access to ${businessName}. Your Systems kept running.`); if (ok) setAgencyId(null); return ok; }} />;

  const quiet = owner ? "Only you can make a change live." : "The owner decides who joins.";
  if (reviewState === "loading") return <div className={styles.screen} aria-busy="true"><XaHeadline quiet={quiet}>{`Who can see and change ${businessName}.`}</XaHeadline><div className={styles.skeletonRows}><StSkeleton label="Loading people" width="80%" /><StSkeleton width="64%" /><StSkeleton width="72%" /></div></div>;
  const retry = () => { setReviewState("loading"); setReload(value => value + 1); };
  // Without the review, nobody is named, but work you shared stays reachable so it can still be stopped.
  if (reviewState === "error" && !snapshot.delegations.some(delegation => delegation.status === "active")) return <RecordTrouble title="People didn't load just now." quiet="Everyone keeps the access they had." action={<XaButton onClick={retry}>Try again</XaButton>} />;

  const pending = invitations.filter(invitation => invitation.status === "pending");
  const shared = snapshot.delegations.filter(delegation => delegation.status === "active");
  return <div className={styles.screen}>
    <XaHeadline quiet={quiet}>{`Who can see and change ${businessName}.`}</XaHeadline>
    {said || failure ? <div role={failure ? "alert" : "status"}><XaSays>{failure ?? said}</XaSays></div> : null}

    {reviewState === "error" ? <div role="alert"><XaSays links={[<XaTextLink key="retry" onClick={retry}>Try again</XaTextLink>]}>{"I couldn’t read who has access just now. Everyone keeps the access they had."}</XaSays></div> : <>
    <section className={styles.section} aria-labelledby="people-label">
      <XaLabel as="h2" id="people-label">People</XaLabel>
      <div className={styles.people}>
        {members.map(member => <PersonRow key={member.id} entry={member} you={member.label === snapshot.actor.email} busy={busy === `member:${member.id}`} onRemove={() => void revoke(member, `${member.label} can no longer open ${businessName}.`)} />)}
        {pending.map(invitation => <div key={invitation.id} className={styles.person}>
          <XaInitial name={invitation.recipientEmail} shape="round" size={40} color="#a3a69f" />
          <span className={styles.personText}><span className={styles.personName}>{invitation.recipientEmail}</span><span className={styles.personDetail}>Invited as {ROLE_WORD[invitation.role]?.toLowerCase()} · link works until {dateWord(invitation.expiresAt)}</span></span>
          <span className={styles.personEnd}>{owner ? <XaTextLink onClick={() => void withdraw(invitation.id)}>Withdraw</XaTextLink> : "Invited"}</span>
        </div>)}
      </div>
      {owner ? <InviteForm workspaceId={workspaceId} businessName={businessName} request={request} onMade={invitation => setInvitations(current => [invitation, ...current])} /> : null}
    </section>

    <section className={styles.section} aria-labelledby="agency-label">
      <XaLabel as="h2" id="agency-label">Your agency</XaLabel>
      {agencies.length ? <div className={styles.people}>{agencies.map(entry => <div key={entry.id} className={styles.person}>
        <XaInitial name={entry.label} size={40} color={AGENCY_COLOR} />
        <span className={styles.personText}><span className={styles.personName}>{entry.label}</span><span className={styles.personDetail}>Prepares changes for your yes{seats.length || assigned.length ? ` · ${seats.length + assigned.length} ${seats.length + assigned.length === 1 ? "person works" : "people work"} on ${businessName}` : ""}</span></span>
        <span className={styles.personEnd}><XaButton size="sm" onClick={() => { setSaid(null); setFailure(null); setAgencyId(entry.id); }}>What they can do</XaButton></span>
      </div>)}</div> : <p className={styles.quietNote}>No agency works on {businessName}.</p>}
      {owner ? <a className={styles.agencyLink} href={`/workspace?${new URLSearchParams({ workspaceId, view: "help" })}`}>{agencies.length ? "Bring in another agency" : "Bring in an agency"}</a> : null}
    </section>

    </>}
    {shared.length ? <section className={styles.section} aria-labelledby="shared-label">
      <XaLabel as="h2" id="shared-label">Work you shared</XaLabel>
      <div className={styles.people}>{shared.map(delegation => {
        const name = agencyNames[delegation.id];
        const work = snapshot.work.find(item => item.id === delegation.workId)?.title;
        return <div key={delegation.id} className={styles.person}>
          <XaInitial name={name || "Agency"} size={40} color={name ? AGENCY_COLOR : "#a3a69f"} />
          <span className={styles.personText}><span className={styles.personName}>{name || "An agency"}</span><span className={styles.personDetail}>Sees {work ? `“${work}”` : "one piece of work"}. Read only.{name ? "" : " I couldn't confirm this agency's name."}</span></span>
          <span className={styles.personEnd}>{delegation.canRevoke ? <XaTextLink onClick={() => void stopSharing(delegation.id, name || "The agency")}>{name ? `Stop sharing with ${name}` : `Stop sharing ${work ? `“${work}”` : "this work"}`}</XaTextLink> : null}</span>
        </div>;
      })}</div>
    </section> : null}

    {assistants.length ? <section className={styles.section} aria-labelledby="assistants-label">
      <XaLabel as="h2" id="assistants-label">Assistants you connected</XaLabel>
      <div className={styles.people}>{assistants.map(entry => <div key={entry.id} className={styles.person}>
        <XaInitial name={entry.label} shape="round" size={40} color="#6b6f68" />
        <span className={styles.personText}><span className={styles.personName}>{entry.label}</span><span className={styles.personDetail}>{entry.lastUsedAt ? `Last used ${dateWord(entry.lastUsedAt)}` : "Not used yet"}</span></span>
        <span className={styles.personEnd}>{entry.canRevoke ? <XaTextLink onClick={() => void revoke(entry, `${entry.label} is disconnected.`)}>Disconnect</XaTextLink> : null}</span>
      </div>)}</div>
    </section> : null}

    <p className={styles.foot}>Every change shows who made it, in Minutes. <XaTextLink href={`/workspace/access-review?${new URLSearchParams({ workspaceId })}`}>See all access</XaTextLink></p>
  </div>;

  async function withdraw(invitationId: string) {
    setFailure(null); setSaid(null);
    try {
      const body = await json<{ status: Invitation["status"] }>(await request("/api/workspace-invitations/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invitationId }) }), "The invitation couldn't be withdrawn.");
      setInvitations(current => current.map(item => item.id === invitationId ? { ...item, status: body.status } : item));
      setSaid(body.status === "revoked" ? "Invitation withdrawn. Its link no longer works." : "That invitation was already closed.");
    } catch (cause) { setFailure(cause instanceof Error ? cause.message : "The invitation couldn't be withdrawn."); }
  }
}

function PersonRow({ entry, you, busy, onRemove }: { entry: Entry; you: boolean; busy: boolean; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return <div className={styles.person}>
    <XaInitial name={entry.label} shape="round" size={40} color={entry.status === "owner" ? AGENCY_COLOR : "#a3a69f"} />
    <span className={styles.personText}><span className={styles.personName}>{entry.label}{you ? " (you)" : ""}</span><span className={styles.personDetail}>{entry.status === "owner" ? "Decides, makes changes live, invites" : entry.status === "admin" ? "Manages the business with you" : "Works in this business"}</span></span>
    <span className={styles.personEnd}>
      {confirming ? <><span>Remove {entry.label}?</span><XaTextLink onClick={() => { setConfirming(false); onRemove(); }}>Yes, remove</XaTextLink><XaTextLink onClick={() => setConfirming(false)}>Keep</XaTextLink></>
        : <>{ROLE_WORD[entry.status] ?? entry.status}{entry.canRevoke ? <XaTextLink onClick={() => setConfirming(true)}>{busy ? "Removing" : "Remove"}</XaTextLink> : null}</>}
    </span>
  </div>;
}

function InviteForm({ workspaceId, businessName, request, onMade }: { workspaceId: string; businessName: string; request: typeof fetch; onMade: (invitation: Invitation) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const domain = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) { setError("Enter their email."); return; }
    setBusy(true); setError(""); setMade(null); setCopied(false);
    try {
      const body = await json<{ invitation: Invitation; token: string }>(await request("/api/workspace-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, recipientEmail: email.trim(), role: "member" }) }), "The invitation couldn't be made.");
      setMade({ email: body.invitation.recipientEmail, link: `${window.location.origin}/workspace/invitations/accept/${body.token}` });
      onMade(body.invitation); setEmail("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The invitation couldn't be made."); }
    finally { setBusy(false); }
  }
  return <>
    <form className={styles.invite} onSubmit={submit}>
      <XaField label="Invite someone" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={`name@${domain || "business"}.com`} error={error || undefined} />
      <XaButton type="submit" variant="primary" busy={busy}>Invite</XaButton>
    </form>
    {made ? <div className={styles.made} role="status">
      <XaSays>{`Share this private link with ${made.email}. It works for seven days, only for that email. Strelva doesn't send it.`}</XaSays>
      <div className={styles.linkBox}><input readOnly value={made.link} aria-label={`Private invitation link for ${made.email}`} onFocus={event => event.currentTarget.select()} /><XaButton size="sm" onClick={() => void navigator.clipboard.writeText(made.link).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy link"}</XaButton></div>
    </div> : null}
  </>;
}

function AgencyPage({ agency, businessName, seats, assigned, owner, workspaceId, busy, failure, initialRemoving, onBack, onRemove }: {
  agency: Entry; businessName: string; seats: Entry[]; assigned: Entry[]; owner: boolean; workspaceId: string; busy: boolean; failure: string | null; initialRemoving: boolean;
  onBack: () => void; onRemove: () => Promise<boolean>;
}) {
  const [removing, setRemoving] = useState(initialRemoving);
  const people = assigned.map(entry => entry.label);
  const team = people.length ? people.length === 1 ? people[0] : `${people[0]} and ${people.length - 1} ${people.length === 2 ? "teammate" : "teammates"}` : null;
  const handoff = !agency.canRevoke;
  return <div className={styles.screen}>
    <nav className={styles.crumb} aria-label="Where you are"><a href="#people" onClick={event => { event.preventDefault(); onBack(); }}>People & access</a><span aria-hidden="true">/</span><span>{agency.label}</span></nav>
    <div className={styles.agencyHead}>
      <XaInitial name={agency.label} size={56} color={AGENCY_COLOR} />
      <div><h1>{agency.label}</h1><p>Your agency{team ? ` · ${team}` : ""}</p></div>
    </div>
    <section className={styles.section} aria-labelledby="can-label">
      <XaLabel as="h2" id="can-label">They can</XaLabel>
      <ul className={styles.group}>
        <li className={styles.can}><span><span className={styles.canTitle}>Prepare changes to your Systems</span><br /><span className={styles.canDetail}>They come to you for a yes before anything goes live.</span></span><span className={styles.canEnd}>Yes</span></li>
        {seats.length ? <li className={styles.can}><span><span className={styles.canTitle}>Work on your website</span><br /><span className={styles.canDetail}>{seats.length === 1 ? "One agency seat is" : `${seats.length} agency seats are`} assigned to {businessName}.</span></span><span className={styles.canEnd}>Yes</span></li> : null}
        {people.length ? <li className={styles.can}><span><span className={styles.canTitle}>{listNames(people)} {people.length === 1 ? "works" : "work"} on {businessName}</span><br /><span className={styles.canDetail}>{agency.label} named {people.length === 1 ? "them" : "each of them"} for the work you agreed.</span></span><span className={styles.canEnd}>{people.length === 1 ? "1 person" : `${people.length} people`}</span></li> : null}
      </ul>
    </section>
    <section className={styles.section} aria-labelledby="never-label">
      <XaLabel as="h2" id="never-label">Never, without you</XaLabel>
      <ul className={styles.group}>
        <li className={styles.can} data-lock><Lock size={16} aria-hidden="true" /><span className={styles.canTitle}>Make anything live</span><span className={styles.canEnd}>Your yes</span></li>
        <li className={styles.can} data-lock><Lock size={16} aria-hidden="true" /><span className={styles.canTitle}>Take your data or your domain</span><span className={styles.canEnd}>Stays yours</span></li>
      </ul>
    </section>
    {failure ? <div role="alert"><XaSays>{failure}</XaSays></div> : null}
    {owner ? <button type="button" className={styles.danger} onClick={() => setRemoving(true)}>Remove {agency.label}</button> : <p className={styles.quietNote}>Only the owner can remove an agency.</p>}
    <XaSheet open={removing} onClose={() => setRemoving(false)} title={`Remove ${agency.label}?`}
      actions={handoff
        ? <><XaButtonLink variant="primary" size="lg" block href={`/workspace/provider-change?${new URLSearchParams({ workspaceId })}`}>Start the handoff</XaButtonLink><XaButton variant="quiet" size="lg" onClick={() => setRemoving(false)}>Keep them</XaButton></>
        : <><XaButton variant="primary" size="lg" block busy={busy} onClick={() => void onRemove().then(ok => { if (ok) setRemoving(false); })}>Remove {agency.label}</XaButton><XaButton variant="quiet" size="lg" onClick={() => setRemoving(false)}>Keep them</XaButton></>}>
      <p className={styles.sheetLede}>{handoff ? "Changing agencies goes through a handoff, so nothing is dropped on the way." : "They lose access right away. Nothing you own changes."}</p>
      <XaAnswers labelWidth={76} rows={handoff
        ? [["Now", `${agency.label} keeps working until the handoff completes.`], ["Stays", `Your Systems and records. They keep running as they are.`]]
        : [["Stays", "Your Systems and records. They keep running as they are."], ["Ends", `${agency.label}'s access to ${businessName}, from the moment you confirm.`], ["Later", "You can bring in an agency again any time."]]} />
      {failure && removing ? <p className={styles.quietNote} role="alert">{failure}</p> : null}
    </XaSheet>
  </div>;
}
