import type { ComponentProps } from "react";
import Link from "next/link";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaButtonLink, XaEmpty, XaInitial, XaPebbleAvatar, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaPlace, XaPlaceHead, XaPlaceLoading, XaPlaceTrouble, xaDayPhrase, xaShortDate } from "@/experience/places/XaPlace";
import place from "@/experience/places/xa-place.module.css";
import type { AgencyProspect } from "@/platform/agency-prospecting/server";
import { identityColor } from "@/platform/presentation/identity-color";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";

type ShellChrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;
/** A business the agency already runs, read through ordinary agency scope by the route. */
export type ProspectKnownClient = { id: string; name: string; href: string };

const TITLE = XA_PLACE_LABELS.checkResults;
const checkName = (prospect: AgencyProspect) => prospect.source === "monitor" ? "answer check" : "website check";
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
function host(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}
const upper = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Check results (route /workspace/prospects; lane xs-leads; XA · S3 shape):
 * businesses that ran the agency's check links, listed beside the one
 * opened. Pebble says what happened and what to do next right above the one
 * ink pill; a business that is already a client says so instead of offering
 * to add it again. Selection is an address (?prospect=), so this stays a
 * server component. Presentation only: the route and native reader keep
 * membership authority.
 * GLOSSARY: "Prospect" is Strelva's own sales record, so the screen never
 * calls these businesses prospects.
 */
export function AgencyProspectsView({ workspaceId, prospects, error, signedIn = true, addClientEnabled = false, loading = false, chrome, knownClients = [], selectedId, hrefFor, now }: {
  workspaceId?: string; prospects: readonly AgencyProspect[]; error?: string | null; signedIn?: boolean; addClientEnabled?: boolean; loading?: boolean; chrome?: ShellChrome;
  knownClients?: readonly ProspectKnownClient[]; selectedId?: string; hrefFor?: (prospectId: string | null) => string; now?: Date;
}) {
  const scope = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  const todayHref = `/workspace${scope}`;
  const addClientHref = `/workspace/agency/clients/new${scope}`;
  const href = hrefFor ?? ((id: string | null) => `/workspace/prospects?${new URLSearchParams({ ...(workspaceId ? { workspace: workspaceId } : {}), ...(id ? { prospect: id } : {}) })}`);
  const clientFor = (prospect: AgencyProspect) => knownClients.find(client => sameName(client.name, prospect.business));
  const current = prospects.find(prospect => prospect.id === selectedId) ?? prospects.find(prospect => !clientFor(prospect)) ?? prospects[0] ?? null;
  const oldest = prospects[prospects.length - 1];
  const art = <XaSystemTile kind="website" size={56} />;
  const status = prospects.length && oldest ? <span>{prospects.length === 1 ? "1 business has" : `${prospects.length} businesses have`} run your check links since {xaShortDate(oldest.created_at)}.</span> : undefined;

  return <StrelvaShell title={TITLE} signedIn={signedIn} workspaceId={workspaceId} signOut={null} agencyNavigation={{}} {...chrome}>
    <XaPlace label={TITLE}>
      <XaPlaceHead art={art} title={TITLE} status={loading ? "Reading who ran your check links" : error ? undefined : status} />
      {loading ? <XaPlaceLoading label="Reading check results" />
        : error ? <XaPlaceTrouble title="Check results didn't load." quiet="Nothing about them changed." action={<XaButtonLink variant="primary" href={todayHref}>Back to {XA_PLACE_LABELS.today}</XaButtonLink>}><p>{error}</p></XaPlaceTrouble>
          : !prospects.length || !current ? <XaEmpty pose="waving" title="No one has run your check yet." job="Pebble is watching your agency's check links" action={<XaButtonLink href={todayHref}>Back to {XA_PLACE_LABELS.today}</XaButtonLink>}>
            Share your check link. When a business runs it, they show up here with their grade.
          </XaEmpty>
            : <div className={place.split} data-open={selectedId ? true : undefined}>
              <ul className={place.list} aria-label="Businesses that ran your check">
                {prospects.map(prospect => {
                  const client = clientFor(prospect);
                  return <li key={prospect.id}><Link className={place.pick} href={href(prospect.id)} aria-current={prospect.id === current.id || undefined} scroll={false}>
                    <span className={place.pickLead}><XaInitial name={prospect.business} shape="square" size={36} color={client ? "var(--st-faint)" : identityColor(prospect.id)} /></span>
                    <span className={place.pickTitle}>{prospect.business}</span>
                    <time className={place.pickMeta} dateTime={prospect.created_at}>{xaShortDate(prospect.created_at)}</time>
                    <span className={place.pickLine} data-quiet={client ? true : undefined}>{client ? "Already a client" : `${upper(checkName(prospect))}: ${prospect.grade}`}</span>
                  </Link></li>;
                })}
              </ul>
              <ProspectDetail prospect={current} client={clientFor(current)} canAdd={addClientEnabled && Boolean(workspaceId)} workspaceId={workspaceId} addClientHref={addClientHref} backHref={href(null)} now={now} />
            </div>}
    </XaPlace>
  </StrelvaShell>;
}

function ProspectDetail({ prospect, client, canAdd, workspaceId, addClientHref, backHref, now }: { prospect: AgencyProspect; client?: ProspectKnownClient; canAdd: boolean; workspaceId?: string; addClientHref: string; backHref: string; now?: Date }) {
  const site = host(prospect.url);
  const when = xaDayPhrase(prospect.created_at, now);
  const check = checkName(prospect);
  const said = client ? <>{prospect.business} ran your {check} {when}. They&apos;re already your client, so there&apos;s nothing to add.</>
    : canAdd ? <>{prospect.business} ran your {check} {when} and scored {prospect.grade}. Add them as a client once they say yes.</>
      : <>{prospect.business} ran your {check} {when} and scored {prospect.grade}. Adding them straight from a check isn&apos;t open yet. Add a client takes the same steps, with their details typed in by you.</>;
  const primary = client ? <XaButtonLink variant="primary" href={client.href}>Open {client.name}</XaButtonLink>
    : canAdd ? <XaButtonLink variant="primary" href={`/workspace/agency/clients/new?${new URLSearchParams({ workspaceId: workspaceId!, prospect: prospect.id })}`}>Add as client</XaButtonLink>
      : <XaButtonLink variant="primary" href={addClientHref}>Add a client</XaButtonLink>;
  return <section className={place.detail} data-fit="true" aria-label={`${prospect.business}'s check`}>
    <span className={place.backToList}><XaTextLink href={backHref}>Back to {TITLE.toLowerCase()}</XaTextLink></span>
    <header className={place.detailHead}>
      <XaInitial name={prospect.business} shape="square" size={40} color={client ? "var(--st-faint)" : identityColor(prospect.id)} />
      <div className={place.detailWho}>
        <h2 className={place.detailName}>{prospect.business}</h2>
        <span className={place.detailMeta}>{[prospect.name, prospect.email, site].filter(Boolean).join(" · ")}</span>
      </div>
    </header>
    <div className={place.detailBody}>
      <p className={place.body}><b>{upper(check)}: {prospect.grade}</b> · <time dateTime={prospect.created_at}>{xaShortDate(prospect.created_at)}</time></p>
      <details className={place.disclosure}>
        <summary>What the grade means</summary>
        <p>It&apos;s the check&apos;s own score for {site ?? "their site"} on the day they ran it. It doesn&apos;t measure the business, and it changes when the site does.</p>
      </details>
    </div>
    <div className={place.speaks}><XaPebbleAvatar size={32} /><p>{said}</p></div>
    <footer className={place.detailFoot}>{primary}</footer>
  </section>;
}
