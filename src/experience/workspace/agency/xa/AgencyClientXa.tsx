"use client";
/**
 * XA · AG3 · Inside one client (Pen GtI53).
 *
 * What waits on the owner, then what the agency may do in this business,
 * grouped by who makes a change live, as the owner set it. The page reads the client's shared
 * Systems, the shared decision status (agency-client-home) and, when the
 * server lets the agency read it, the owner's area choices
 * (`/api/workspace/agencies`). When those choices can't be read, the page says
 * so instead of guessing a level.
 */
import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { z } from "zod";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaInitial, XaLabel, XaRow, XaRows, XaSays, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { AGENCY_SCOPES, AGENCY_SCOPE_LABELS, type AgencyLevel, type AgencyScope } from "@/platform/agency-directory/contract";
import { actorPresentation } from "@/platform/presentation/actor";
import { clientDecisionHref } from "@/platform/workspaces/location";
import type { SystemView } from "@/experience/systems/model";
import type { AgencyClientHomeState } from "../../useAgencyClientHome";
import { clientColor } from "./client-color";
import styles from "./agency-xa.module.css";

const SCOPE_OF_KIND: Partial<Record<SystemView["kind"], AgencyScope>> = {
  website: "website", inquiries: "inquiries", onboarding: "inquiries", bookings: "bookings", listing: "google",
  app: "internal_tools", tracker: "internal_tools", document: "internal_tools", home_finder: "website", newsletter: "website",
};

const grantsSchema = z.object({ agencies: z.array(z.object({
  agencyWorkspaceId: z.string(),
  scopes: z.array(z.object({ scope: z.enum(AGENCY_SCOPES), level: z.enum(["prepare", "full_control"]), status: z.enum(["proposed", "active"]) })),
}).passthrough()) }).passthrough();

export type AgencyGrants =
  | { status: "loading" }
  | { status: "unreadable" }
  | { status: "ready"; levels: Partial<Record<AgencyScope, { level: AgencyLevel; proposed: boolean }>> };

/** The owner's area choices for this agency, read the same way the owner's Bring in an agency reads them. */
export function useAgencyGrants(request: typeof fetch, businessWorkspaceId: string, agencyWorkspaceId: string | undefined): AgencyGrants {
  const [stored, setStored] = useState<{ key: string; grants: AgencyGrants } | null>(null);
  const key = `${businessWorkspaceId}:${agencyWorkspaceId}`;
  useEffect(() => {
    if (!agencyWorkspaceId) return;
    const controller = new AbortController();
    void request(`/api/workspace/agencies?${new URLSearchParams({ workspaceId: businessWorkspaceId })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("unreadable");
      const parsed = grantsSchema.parse(await response.json());
      const mine = parsed.agencies.find(agency => agency.agencyWorkspaceId === agencyWorkspaceId);
      const levels: Partial<Record<AgencyScope, { level: AgencyLevel; proposed: boolean }>> = {};
      for (const scope of mine?.scopes ?? []) levels[scope.scope] = { level: scope.level, proposed: scope.status === "proposed" };
      if (!controller.signal.aborted) setStored({ key, grants: { status: "ready", levels } });
    }).catch(() => { if (!controller.signal.aborted) setStored({ key, grants: { status: "unreadable" } }); });
    return () => controller.abort();
  }, [request, businessWorkspaceId, agencyWorkspaceId, key]);
  if (!agencyWorkspaceId) return { status: "unreadable" };
  return stored?.key === key ? stored.grants : { status: "loading" };
}

export interface AgencyClientXaProps {
  clientName: string;
  workspaceId: string;
  agencyName: string;
  agencyHref: string;
  /** The owner's name when the business record shares it; otherwise "<client>'s owner". */
  ownerName?: string | null;
  systems: readonly SystemView[];
  systemsLoading?: boolean;
  grants: AgencyGrants;
  shared: AgencyClientHomeState;
  systemHref: (systemId: string) => string;
  onOpenSystem?: (systemId: string) => void;
  onRetryShared: () => void;
  onAsk?: () => void;
  /** The agency's own tools for this client (its Full-control decisions, responsibility, time), under the page. */
  tools?: ReactNode;
}

type Group = { key: AgencyLevel | "kept" | "shared"; title: string; note?: string; items: { key: string; system?: SystemView; label: string; proposed?: boolean }[] };

/**
 * One column, no cards: what waits on the owner first, then who makes each
 * change live (Prepare and Full control labelled in place, each with the
 * Systems it covers), then what changed, then what only the owner can do,
 * said once as a sentence.
 */
export function AgencyClientXa({ clientName, workspaceId, agencyName, agencyHref, ownerName, systems, systemsLoading, grants, shared, systemHref, onOpenSystem, onRetryShared, onAsk, tools }: AgencyClientXaProps) {
  const owner = ownerName || `${clientName}’s owner`;
  const open = shared.status === "ready" ? shared.data.decisions.filter(item => item.state === "open") : [];
  const changes = shared.status === "ready" ? shared.data.changes.slice(0, 5) : [];
  const live = systems.filter(system => system.lifecycle === "live").length;
  const meta = [ownerName ? `${ownerName} owns it` : null, systemsLoading ? null : live ? `${live} ${live === 1 ? "System" : "Systems"} live` : systems.length ? "Nothing live yet" : null, `Shared with ${agencyName}`].filter(Boolean).join(" · ");
  const groups = levelGroups(systems, grants, owner, agencyName);

  return <div className={styles.client}>
    <nav aria-label="Breadcrumb"><ol className={styles.crumbs}><li><a href={agencyHref}>Clients</a></li><li aria-current="page">{clientName}</li></ol></nav>
    <header className={styles.clientHead}>
      <XaInitial name={clientName} color={clientColor(workspaceId)} size={48} />
      <div className={styles.clientTitle}><h1 id="business-start-title">{clientName}</h1><p>{meta}</p></div>
      {onAsk ? <div className={styles.clientAsk}><XaButton onClick={onAsk}><MessageCircle size={15} strokeWidth={1.8} aria-hidden="true" />Ask about {clientName}</XaButton></div> : null}
    </header>

    <section className={styles.group} aria-labelledby="client-decision-status">
      <XaLabel id="client-decision-status" as="h2">Waiting on {clientName}</XaLabel>
      {shared.status === "loading" || shared.status === "disabled" ? <p role="status" className={styles.note}>Checking what waits on {owner}…</p>
        : shared.status === "error" ? <div role="alert"><XaSays links={[<XaTextLink key="again" onClick={onRetryShared}>Check again</XaTextLink>]}>What waits on {owner} could not be checked. Nothing changed.</XaSays></div>
          : open.length ? <XaRows label={`Waiting on ${clientName}`}>{open.map(item => <XaRow key={item.id} title={item.title}
            detail={`Sent ${new Date(item.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Only ${owner} can say yes.`}
            action={<XaTextLink href={clientDecisionHref(workspaceId, item.id)} aria-label={`See it: ${item.title}`}>See it</XaTextLink>} />)}</XaRows>
            : <p className={styles.note}>Nothing waits on {owner}. What you send for a yes shows here until it&apos;s decided.</p>}
    </section>

    <section className={styles.group} aria-labelledby="client-areas">
      <XaLabel id="client-areas" as="h2">Who makes each change live</XaLabel>
      {systemsLoading ? <div className={styles.skeletonRows} role="status" aria-label="Loading shared Systems">{[80, 64, 72].map(width => <StSkeleton key={width} width={`${width}%`} />)}</div>
        : groups.length ? <dl className={styles.levels} aria-label={`Who makes each change live in ${clientName}`}>
          {groups.map(group => <div key={group.key} className={styles.levelRow} data-level={group.key}>
            <dt>{group.title}</dt>
            <dd>
              <ul className={styles.levelSystems}>{group.items.map(item => <li key={item.key}>
                {item.system ? <a className={styles.systemLink} href={systemHref(item.system.id)} onClick={onOpenSystem ? event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                  event.preventDefault(); onOpenSystem(item.system!.id);
                } : undefined}><XaSystemTile kind={item.system.kind} size={24} />{item.label}</a> : <span className={styles.systemLink}>{item.label}</span>}
                {item.proposed ? <small className={styles.proposed}>starts when you accept it</small> : null}
              </li>)}</ul>
              {group.note ? <p className={styles.levelNote}>{group.note}</p> : null}
            </dd>
          </div>)}
        </dl>
          : <p className={styles.note}>{clientName} hasn&apos;t shared a System with {agencyName} yet. Shared Systems appear here as soon as {owner} adds them.</p>}
      {grants.status === "loading" ? <p role="status" className={styles.note}>Reading what {owner} set for {agencyName}…</p> : null}
      {grants.status === "unreadable" && groups.length ? <p className={styles.note}>What {owner} set for each area isn&apos;t shared with agencies on this page yet. Strelva still enforces it on every change you make here.</p> : null}
    </section>

    {changes.length ? <section className={styles.group} aria-labelledby="client-changes">
      <XaLabel id="client-changes" as="h2">Changed in the last 7 days</XaLabel>
      <XaRows label="Changed in the last 7 days">{changes.map(change => <XaRow key={change.id} title={change.title} detail={byLine(change.actor)} meta={new Date(change.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} href={systemHref(change.systemId)} />)}</XaRows>
    </section> : null}

    <p className={styles.ownerOnly}>Only {owner} can pay for Strelva, add or end an agency, or take the business and its data elsewhere.</p>
    {tools ? <div className={styles.clientTools}>{tools}</div> : null}
  </div>;
}

/** Areas grouped by who makes a change live there. Areas with neither a System nor a level stay out. */
function levelGroups(systems: readonly SystemView[], grants: AgencyGrants, owner: string, agencyName: string): Group[] {
  const areas = AGENCY_SCOPES.map(scope => ({
    scope,
    systems: systems.filter(system => SCOPE_OF_KIND[system.kind] === scope),
    grant: grants.status === "ready" ? grants.levels[scope] : undefined,
  })).filter(area => area.systems.length || area.grant);
  const items = (area: (typeof areas)[number]): Group["items"] => area.systems.length
    ? area.systems.map(system => ({ key: system.id, system, label: system.name, proposed: area.grant?.proposed }))
    : [{ key: area.scope, label: AGENCY_SCOPE_LABELS[area.scope], proposed: area.grant?.proposed }];
  if (grants.status !== "ready") {
    const shared = areas.flatMap(items);
    return shared.length ? [{ key: "shared", title: `Shared with ${agencyName}`, items: shared }] : [];
  }
  const groups: Group[] = [
    { key: "full_control", title: "Full control", note: `You make changes live. ${owner.charAt(0).toUpperCase()}${owner.slice(1)} sees each one in What changed.`, items: areas.filter(area => area.grant?.level === "full_control").flatMap(items) },
    { key: "prepare", title: "Prepare", note: `You build and stage changes. ${owner.charAt(0).toUpperCase()}${owner.slice(1)} makes them live.`, items: areas.filter(area => area.grant?.level === "prepare").flatMap(items) },
    { key: "kept", title: `${owner.charAt(0).toUpperCase()}${owner.slice(1)} keeps`, items: areas.filter(area => !area.grant).flatMap(items) },
  ];
  return groups.filter(group => group.items.length);
}

function byLine(actor: unknown): string {
  const { name, credit } = actorPresentation(actor);
  return name ? `By ${name}${credit ? ` · ${credit}` : ""}` : "Who made this change wasn't recorded";
}
