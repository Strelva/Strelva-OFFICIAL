"use client";
/**
 * XA · AG3 · Inside one client (Pen GtI53).
 *
 * What the agency may do in this business, area by area, as the owner set it,
 * beside what only the owner can do. The page reads the client's shared
 * Systems, the shared decision status (agency-client-home) and, when the
 * server lets the agency read it, the owner's area choices
 * (`/api/workspace/agencies`). When those choices can't be read, the page says
 * so instead of guessing a level.
 */
import { useEffect, useState } from "react";
import { Lock, MessageCircle } from "lucide-react";
import { z } from "zod";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaInitial, XaLabel, XaRow, XaRows, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
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
  /** The owner's name when the business record shares it; otherwise "the owner". */
  ownerName?: string | null;
  systems: readonly SystemView[];
  systemsLoading?: boolean;
  grants: AgencyGrants;
  shared: AgencyClientHomeState;
  systemHref: (systemId: string) => string;
  onOpenSystem?: (systemId: string) => void;
  onRetryShared: () => void;
  onAsk?: () => void;
}

export function AgencyClientXa({ clientName, workspaceId, agencyName, agencyHref, ownerName, systems, systemsLoading, grants, shared, systemHref, onOpenSystem, onRetryShared, onAsk }: AgencyClientXaProps) {
  const owner = ownerName || "the owner";
  const Owner = ownerName || "The owner";
  const open = shared.status === "ready" ? shared.data.decisions.filter(item => item.state === "open") : [];
  const changes = shared.status === "ready" ? shared.data.changes.slice(0, 5) : [];
  const live = systems.filter(system => system.lifecycle === "live").length;
  const meta = [ownerName ? `${ownerName} owns it` : "The owner decides here", open.length ? `${open.length} waiting on ${clientName}` : "", live ? `${live} live` : ""].filter(Boolean).join(" · ");

  // One row per area that has a System or a level; areas with neither stay out.
  const areas = AGENCY_SCOPES.map(scope => ({
    scope,
    systems: systems.filter(system => SCOPE_OF_KIND[system.kind] === scope),
    grant: grants.status === "ready" ? grants.levels[scope] : undefined,
  })).filter(area => area.systems.length || area.grant);

  return <div className={styles.client}>
    <nav aria-label="Breadcrumb"><ol className={styles.crumbs}><li><a href={agencyHref}>Clients</a></li><li aria-current="page">{clientName}</li></ol></nav>
    <header className={styles.clientHead}>
      <XaInitial name={clientName} color={clientColor(workspaceId)} size={56} />
      <div className={styles.clientTitle}><h1 id="business-start-title">{clientName}</h1><p>{meta}</p></div>
      {onAsk ? <XaButton onClick={onAsk}><MessageCircle size={15} strokeWidth={1.8} aria-hidden="true" />Ask about {clientName}</XaButton> : null}
    </header>

    <div className={styles.clientBody}>
      <div className={styles.clientMain}>
        <section className={styles.areas} aria-labelledby="client-areas">
          <XaLabel id="client-areas" as="h2">What {agencyName} can do here, set by {owner}</XaLabel>
          {systemsLoading ? <div className={styles.areaList}><div className={styles.skeletonRows} role="status" aria-label="Loading shared Systems">{[80, 64, 72].map(width => <StSkeleton key={width} width={`${width}%`} />)}</div></div>
            : areas.length ? <div className={styles.areaList}><XaRows label={`What ${agencyName} can do in ${clientName}`}>
              {areas.map(({ scope, systems: inArea, grant }) => <XaRow key={scope}
                lead={<XaSystemTile kind={inArea[0]?.kind ?? scope} size={36} />}
                title={inArea.length === 1 ? inArea[0]!.name : AGENCY_SCOPE_LABELS[scope]}
                detail={grants.status === "ready" ? areaSentence(grant?.level, Owner, grant?.proposed) : inArea.map(system => system.detail || system.name).join(" · ")}
                href={inArea.length === 1 ? systemHref(inArea[0]!.id) : undefined}
                onClick={inArea.length === 1 && onOpenSystem ? () => onOpenSystem(inArea[0]!.id) : undefined}
                // The sentence already says the level; only an area the owner kept gets a mark.
                meta={grants.status === "ready" && !grant ? <span className={styles.level} data-level="none">Not given</span> : undefined} />)}
            </XaRows></div>
            : <p className={styles.note}>{clientName} hasn&apos;t shared a System with {agencyName} yet. Shared Systems appear here as soon as {owner} adds them.</p>}
          {grants.status === "loading" ? <p role="status" className={styles.note}>Reading what {owner} set for {agencyName}…</p> : null}
          {grants.status === "unreadable" ? <p className={styles.note}>What {owner} set for each area isn&apos;t shared with agencies on this page yet. Strelva still enforces it on every change you make here.</p> : null}
        </section>

        <section className={styles.group} aria-labelledby="client-decision-status">
          <XaLabel id="client-decision-status" as="h2">Waiting on {clientName}</XaLabel>
          {shared.status === "loading" || shared.status === "disabled" ? <p role="status" className={styles.note}>Checking shared decision status…</p>
            : shared.status === "error" ? <p role="alert" className={styles.inlineAlert}>Shared decisions could not be checked. Nothing changed. <XaTextLink onClick={onRetryShared}>Check again</XaTextLink></p>
              : open.length ? <XaRows label={`Waiting on ${clientName}`}>{open.map(item => <XaRow key={item.id} title={item.title}
                detail={`Sent ${new Date(item.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Only ${owner} can say yes.`}
                action={<XaTextLink href={clientDecisionHref(workspaceId, item.id)} aria-label={`See it: ${item.title}`}>See it</XaTextLink>} />)}</XaRows>
                : <p className={styles.note}>Nothing waits on {owner}. What you send for a yes shows here until it&apos;s decided.</p>}
        </section>

        {changes.length ? <section className={styles.group} aria-labelledby="client-changes">
          <XaLabel id="client-changes" as="h2">Changed in the last 7 days</XaLabel>
          <XaRows label="Changed in the last 7 days">{changes.map(change => <XaRow key={change.id} title={change.title} detail={byLine(change.actor)} meta={new Date(change.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} href={systemHref(change.systemId)} />)}</XaRows>
        </section> : null}
      </div>

      <aside className={styles.onlyOwner} aria-labelledby="client-only-owner">
        <XaLabel id="client-only-owner" as="h2">Only {owner} can</XaLabel>
        <ul className={styles.lockList}>
          {["Put Prepare work live", "Pay for Strelva", "Add or end an agency", "Take the business and its data elsewhere"].map(text => <li key={text}><Lock size={16} aria-hidden="true" />{text}</li>)}
        </ul>
        <p className={styles.note}>Prepare means nothing goes live without {owner}. Full control means you can put it live and {owner} sees it in Minutes.</p>
      </aside>
    </div>
  </div>;
}

function areaSentence(level: AgencyLevel | undefined, owner: string, proposed?: boolean): string {
  const pending = proposed ? " Starts when you accept it." : "";
  if (level === "full_control") return `You can put changes live. ${owner} sees them in Minutes.${pending}`;
  if (level === "prepare") return `You build and stage changes. ${owner} puts them live.${pending}`;
  return `${owner} keeps this one.`;
}

function byLine(actor: unknown): string {
  const { name, credit } = actorPresentation(actor);
  return name ? `By ${name}${credit ? ` · ${credit}` : ""}` : "Who made this change wasn't recorded";
}
