import type { ComponentProps } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaButtonLink, XaEmpty, XaHeadline, XaInitial, XaLabel, XaRow, XaRows } from "@/components/ui/strelva/Xa";
import { XaPlace, XaPlaceLoading, XaPlaceTrouble, xaShortDate } from "@/experience/places/XaPlace";
import place from "@/experience/places/xa-place.module.css";
import type { AgencyProspect } from "@/platform/agency-prospecting/server";

type ShellChrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;

function monthOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function host(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

/**
 * Prospects in XA (shaped like XA · AG2 Queue): businesses that ran the
 * agency's check link, newest first, grouped by month. The newest one gets
 * the screen's one ink pill when adding clients is released.
 * Presentation only. The route and native reader retain membership authority.
 */
export function AgencyProspectsView({ workspaceId, prospects, error, signedIn = true, addClientEnabled = false, loading = false, chrome }: {
  workspaceId?: string; prospects: readonly AgencyProspect[]; error?: string | null; signedIn?: boolean; addClientEnabled?: boolean; loading?: boolean; chrome?: ShellChrome;
}) {
  const workspaceHref = workspaceId ? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` : "/workspace";
  const canAdd = addClientEnabled && Boolean(workspaceId);
  const latestMonth = prospects[0] ? monthOf(prospects[0].created_at) : "";
  const recent = prospects.filter(prospect => monthOf(prospect.created_at) === latestMonth);
  const earlier = prospects.filter(prospect => monthOf(prospect.created_at) !== latestMonth);
  const row = (prospect: AgencyProspect, index: number) => {
    const check = prospect.source === "monitor" ? "Answer check" : "Website check";
    const site = host(prospect.url);
    return <XaRow key={prospect.id} lead={<XaInitial name={prospect.business} size={32} color="var(--st-text-2)" />} title={prospect.business}
      detail={<>{prospect.name} · {prospect.email}{site ? ` · ${site}` : ""}<br />{check} · {prospect.grade} ({prospect.score}/100)</>}
      meta={<time dateTime={prospect.created_at}>{xaShortDate(prospect.created_at)}</time>}
      action={canAdd ? <XaButtonLink size="sm" variant={index === 0 ? "primary" : "secondary"} href={`/workspace/agency/clients/new?${new URLSearchParams({ workspaceId: workspaceId!, prospect: prospect.id })}`}>Add as client</XaButtonLink> : undefined} />;
  };
  return <StrelvaShell title="Prospects" signedIn={signedIn} workspaceId={workspaceId} signOut={null} agencyNavigation={{}} {...chrome}>
    <XaPlace width="read" label="Prospects">
      <XaLabel>Prospects</XaLabel>
      {loading ? <div role="status"><p className={place.quiet}>Reading prospects…</p><XaPlaceLoading label="Reading prospects" /></div>
        : error ? <XaPlaceTrouble title="Prospects did not load." quiet="Nothing about them changed." action={<XaButtonLink href={workspaceHref}>Back to workspace</XaButtonLink>}><p>{error}</p></XaPlaceTrouble>
          : prospects.length === 0 ? <XaEmpty pose="waving" title="No prospects yet." job="Pebble is watching your agency's check links" action={<XaButtonLink variant="primary" href={workspaceHref}>Back to workspace</XaButtonLink>}>
            Share your agency check link. When a business runs it, they land here with their grade.
          </XaEmpty>
            : <>
              <XaHeadline quiet={canAdd ? "Add one as a client once they say yes." : "Adding clients from here isn't available yet."}>
                {recent.length === 1 ? `1 business ran your check in ${latestMonth}.` : `${recent.length} businesses ran your check in ${latestMonth}.`}
              </XaHeadline>
              <p className={place.quiet}>The latest 200 requests from your agency&apos;s check links. A grade is the check&apos;s own score, not a measure of the business.</p>
              <section className={place.stack} aria-label={latestMonth}>
                <XaLabel as="h2">{latestMonth}</XaLabel>
                <XaRows label={`Prospects in ${latestMonth}`}>{recent.map(row)}</XaRows>
              </section>
              {earlier.length ? <section className={place.stack} aria-label="Earlier">
                <XaLabel as="h2">Earlier</XaLabel>
                <XaRows label="Earlier prospects">{earlier.map(prospect => row(prospect, -1))}</XaRows>
              </section> : null}
            </>}
    </XaPlace>
  </StrelvaShell>;
}
