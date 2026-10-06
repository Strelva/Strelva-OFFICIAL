import { Card } from "@/components/ui/Card";
import type { HeldInquiries, HeldView, LeadView, WorkspaceLeads } from "@/products/inquiries/linked-leads";
import { HeldInquiryActions } from "./HeldInquiryActions";
import { NoSiteCard, SiteHeading, WorkspacePlace, whenLabel, type PlaceState } from "./WorkspacePlace";

/**
 * Inquiries, in the workspace: everyone who reached out through the site,
 * newest first, with a one-tap email reply. The home of /dashboard/leads.
 */

function sourceLabel(source: string): string {
  const text = source.replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function LeadCard({ lead, workspaceId }: { lead: LeadView; workspaceId: string }) {
  return (
    <Card padding="md">
      <article aria-labelledby={`lead-${lead.id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={`lead-${lead.id}`} className="truncate text-[15px] font-medium">{lead.name}</h3>
            <p className="mt-1 text-xs text-gray-muted"><time dateTime={lead.createdAt}>{whenLabel(lead.createdAt, true)}</time></p>
          </div>
          {lead.source ? <span className="shrink-0 rounded-md border border-gray-border px-2 py-0.5 text-xs text-gray-muted">{sourceLabel(lead.source)}</span> : null}
        </div>
        {lead.message ? <p className="mt-3 whitespace-pre-line text-sm leading-6">{lead.message}</p> : null}
        {lead.fields.length ? (
          <dl className="mt-3 grid gap-1 text-sm">
            {lead.fields.map(([key, value]) => <div key={key} className="flex gap-2"><dt className="text-gray-muted">{sourceLabel(key)}:</dt><dd className="min-w-0 break-words">{value}</dd></div>)}
          </dl>
        ) : null}
        {lead.email ? (
          <p className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <a className="inline-flex min-h-[40px] items-center rounded-lg bg-warm-black px-3 font-medium text-warm-white" href={`mailto:${encodeURIComponent(lead.email).replace(/%40/g, "@")}`}>Reply by email</a>
            <span className="break-all text-gray-muted">{lead.email}</span>
          </p>
        ) : null}
        {lead.releasedRowId ? (
          <>
            <p className="mt-3 text-xs text-gray-muted">Released from held messages.</p>
            <HeldInquiryActions workspaceId={workspaceId} rowId={lead.releasedRowId} name={lead.name} mode="released" />
          </>
        ) : null}
      </article>
    </Card>
  );
}

function reasonLabel(reason: string | null): string {
  if (!reason) return "Looked like spam";
  if (reason === "honeypot") return "Filled in a field people can't see";
  if (reason === "turnstile") return "Failed the robot check";
  return "Looked like spam";
}

function HeldCard({ item, workspaceId }: { item: HeldView; workspaceId: string }) {
  return (
    <Card padding="md">
      <article aria-labelledby={`held-${item.rowId}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={`held-${item.rowId}`} className="truncate text-[15px] font-medium">{item.name}</h3>
            <p className="mt-1 text-xs text-gray-muted"><time dateTime={item.createdAt}>{whenLabel(item.createdAt, true)}</time> · {reasonLabel(item.reason)}</p>
          </div>
        </div>
        {item.message ? <p className="mt-3 line-clamp-4 whitespace-pre-line break-words text-sm leading-6">{item.message}</p> : null}
        {item.email ? <p className="mt-2 break-all text-sm text-gray-muted">{item.email}</p> : null}
        <HeldInquiryActions workspaceId={workspaceId} rowId={item.rowId} name={item.name} mode="held" />
      </article>
    </Card>
  );
}

/** Messages Strelva held as spam. Shown only when there is something to decide or the list failed. */
function HeldSection({ held, workspaceId }: { held: HeldInquiries; workspaceId: string }) {
  if (!held.unavailable && held.items.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="held-messages">
      <h2 id="held-messages" className="text-base font-medium">Held as spam</h2>
      <p className="mt-1 mb-3 text-sm leading-6 text-gray-muted">Strelva kept these out of your inbox. If one is a real person, release it. Nobody is emailed either way.</p>
      {held.unavailable ? (
        <Card padding="lg" role="status"><p className="text-sm leading-6 text-gray-muted">Held messages couldn&apos;t be read right now. Nothing is lost; reload to try again.</p></Card>
      ) : (
        <div className="grid gap-3">{held.items.map((item) => <HeldCard key={item.rowId} item={item} workspaceId={workspaceId} />)}</div>
      )}
    </section>
  );
}

export function WorkspaceInquiries({ workspaceId, state }: { workspaceId: string; state: PlaceState<WorkspaceLeads> }) {
  const data = state.kind === "ready" ? state.data : null;
  return (
    <WorkspacePlace workspaceId={workspaceId} eyebrow="Inquiries" title="Who reached out"
      intro="Everyone who contacted you through your site, newest first. Strelva keeps the last 90 days here."
      state={state} denied={data?.denied.map((site) => site.siteName)}
      errorTitle="Inquiries couldn't load" errorBody="Nothing is lost. New messages still reach your inbox. Reload the page to try again.">
      {data && data.sites.length === 0 && data.denied.length === 0 ? <NoSiteCard body="Inquiries start once Strelva runs a website with a contact form for this business." /> : null}
      {data?.sites.map((site) => (
        <section key={site.tenantId} className="mt-8" aria-labelledby={`site-${site.tenantId}`}>
          <SiteHeading id={`site-${site.tenantId}`} name={site.siteName} multiple={data.sites.length > 1} />
          {site.unavailable ? (
            <Card padding="lg" role="status"><p className="text-sm leading-6 text-gray-muted">Messages for {site.siteName} couldn&apos;t be read right now. New messages are still captured and emailed to you.</p></Card>
          ) : site.leads.length === 0 ? (
            <Card padding="lg">
              <h3 className="text-base font-medium">No one has reached out yet</h3>
              <p className="mt-2 text-sm leading-6 text-gray-muted">When someone contacts you through {site.siteName}, they show up here with their name and what they asked.</p>
            </Card>
          ) : (
            <>
              <p className="mb-3 text-sm text-gray-muted">{site.lastThirtyDays} in the last 30 days · {site.leads.length} in all</p>
              <div className="grid gap-3">{site.leads.map((lead) => <LeadCard key={lead.id} lead={lead} workspaceId={workspaceId} />)}</div>
            </>
          )}
        </section>
      ))}
      {data?.held ? <HeldSection held={data.held} workspaceId={workspaceId} /> : null}
    </WorkspacePlace>
  );
}
