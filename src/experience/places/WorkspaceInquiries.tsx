import { ProposeBookingTimes } from "@/experience/bookings/ProposeBookingTimes";
import { StPage, StHead, StSection, StRows, StRow, StSurface, StNotice, StEmpty, StMono, StTextButton, StPillLink } from "@/components/ui/strelva/Kit";
import type { HeldInquiries, HeldView, LeadView, WorkspaceLeads } from "@/products/inquiries/client";
import { REPLY_OUTCOME, WorkspaceInquiryReply } from "./WorkspaceInquiryReply";
import { InquiryInbox } from "./InquiryInbox";
import { HeldInquiryActions } from "./HeldInquiryActions";
import { ForwardInquiries } from "./ForwardInquiries";
import { placeHomeHref, whenLabel, type PlaceState } from "./WorkspacePlace";

/**
 * Inquiries, in the workspace: everyone who reached out through the site,
 * newest first, with a one-tap email reply. The home of /dashboard/leads.
 */

function sourceLabel(source: string): string {
  const text = source.replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function LeadCard({ lead, workspaceId, tenantId, bookingProposals, replies, bookingOffers }: { lead: LeadView; workspaceId: string; tenantId: string | null; bookingProposals?: boolean; replies?: boolean; bookingOffers?: boolean }) {
  return (
    <div className="min-w-0">
      <article aria-labelledby={`lead-${lead.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={`lead-${lead.id}`} className="break-words text-base font-medium">{lead.name}</h3>
            <p className="mt-1 text-xs text-gray-muted"><time dateTime={lead.createdAt}>{whenLabel(lead.createdAt, true)}</time></p>
          </div>
          {lead.source ? <span className="min-w-0 max-w-full break-words text-xs text-gray-muted">{sourceLabel(lead.source)}</span> : null}
        </div>
        {lead.message ? <div className="my-4"><StSurface label={`Message from ${lead.name}`}><p className="whitespace-pre-line break-words text-sm leading-6">{lead.message}</p></StSurface></div> : null}
        {lead.fields.length ? (
          <dl className="mt-3 grid gap-1 text-sm">
            {lead.fields.map(([key, value]) => <div key={key} className="flex flex-wrap gap-2"><dt className="min-w-0 max-w-full break-words text-gray-muted">{sourceLabel(key)}:</dt><dd className="min-w-0 break-words">{value}</dd></div>)}
          </dl>
        ) : null}
        {replies && lead.reply && Object.hasOwn(REPLY_OUTCOME, lead.reply.status) ? <p role="status" className="mt-4 text-sm">{REPLY_OUTCOME[lead.reply.status]}{lead.reply.providerMessageId ? <span className="mt-1 block break-all text-xs text-gray-muted">Provider receipt: {lead.reply.providerMessageId}</span> : null}</p> : lead.email && replies && lead.rowId && lead.replyPermission === "none" ? <p className="mt-4 text-sm text-gray-muted">The owner or the assigned team member can reply to this inquiry.</p> : lead.email && replies && lead.rowId ? <WorkspaceInquiryReply workspaceId={workspaceId} rowId={lead.rowId} name={lead.name} email={lead.email} bookingOffers={bookingOffers && lead.replyPermission !== "member"} member={lead.replyPermission === "member"} /> : lead.email ? (
          <p className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <StPillLink variant="soft" href={`mailto:${encodeURIComponent(lead.email).replace(/%40/g, "@")}`}>Reply by email</StPillLink>
            <span className="break-all text-gray-muted">{lead.email}</span>
          </p>
        ) : null}
        {bookingProposals && tenantId && lead.email ? <ProposeBookingTimes workspaceId={workspaceId} tenantId={tenantId} inquiryId={lead.id} customerName={lead.name} /> : null}
        {lead.releasedRowId ? (
          <>
            <p className="mt-3 text-xs text-gray-muted">Released from held messages.</p>
            <HeldInquiryActions workspaceId={workspaceId} rowId={lead.releasedRowId} name={lead.name} mode="released" />
          </>
        ) : null}
      </article>
    </div>
  );
}

function reasonLabel(reason: string | null): string {
  if (!reason) return "Looked like spam";
  if (reason === "honeypot") return "Filled in a field people can't see";
  if (reason === "turnstile") return "Failed the robot check";
  if (reason === "spam_header") return "Your email marked it as spam";
  if (reason === "bulk_mail") return "Looked like a newsletter or mailing list";
  if (reason === "volume") return "Arrived with an unusual number of forwarded messages";
  return "Looked like spam";
}

function HeldCard({ item, workspaceId }: { item: HeldView; workspaceId: string }) {
  return <StRow title={item.name} detail={<><StMono as="time" dateTime={item.createdAt}>{whenLabel(item.createdAt, true)}</StMono> · {reasonLabel(item.reason)}</>} align="start" end={<HeldInquiryActions workspaceId={workspaceId} rowId={item.rowId} name={item.name} mode="held" />}>
    {item.message ? <span className="mt-3 block whitespace-pre-line break-words text-sm leading-6">{item.message}</span> : null}
    {item.email ? <span className="mt-2 block break-all text-sm text-gray-muted">{item.email}</span> : null}
  </StRow>;
}

/** Messages Strelva held as spam. Shown only when there is something to decide or the list failed. */
function HeldSection({ held, workspaceId }: { held: HeldInquiries; workspaceId: string }) {
  if (!held.unavailable && held.items.length === 0) return null;
  return <StSection title="Held as spam">
    <p className="text-sm leading-6 text-gray-muted">Strelva kept these out of your inbox. If one is a real person, release it. Nobody is emailed either way.</p>
    {held.unavailable ? <StNotice tone="critical">Held messages couldn&apos;t be read right now. Nothing is lost; reload to try again.</StNotice> : <StRows label="Held messages">{held.items.map(item => <HeldCard key={item.rowId} item={item} workspaceId={workspaceId} />)}</StRows>}
  </StSection>;
}

export function WorkspaceInquiries({ workspaceId, state, embedded = false, forwarding = false }: { workspaceId: string; state: PlaceState<WorkspaceLeads>; embedded?: boolean; forwarding?: boolean }) {
  const data = state.kind === "ready" ? state.data : null;
  const content = <>
    <StHead crumb={embedded ? undefined : { label: "Home", href: placeHomeHref(workspaceId) }} title="Inquiries" meta={data?.durable ? "People who contacted you through your site. Your inquiries stay on record." : "People who contacted you through your site. Strelva keeps the last 90 days here."} />
    {state.kind === "permission" ? <StEmpty action={<StPillLink variant="soft" href="/workspace">Open your workspace</StPillLink>}>Your account isn&apos;t a member of this business. Ask its owner to invite you.</StEmpty> : state.kind === "error" ? <StNotice tone="critical">Inquiries couldn&apos;t load. Nothing is lost. Reload to check the current records.</StNotice> : <>
      {data?.denied.length ? <StNotice>Your account can&apos;t open {data.denied.map(site => site.siteName).join(", ")} yet. Ask the owner to finish adding you.</StNotice> : null}
      {data && data.sites.length === 0 && data.denied.length === 0 && !forwarding ? <StEmpty>No site is connected to this business yet. Inquiries start once a connected site sends its contact form here.</StEmpty> : null}
      {data?.sites.map(site => <StSection key={site.key} id={`site-${site.key.replace(/[^a-z0-9-]/gi, "-")}`} title={site.connected ? `${site.siteName} (your site)` : site.siteName} meta={site.unavailable ? undefined : <StMono>{data.paged ? "" : `${site.lastThirtyDays} in the last 30 days · `}{site.leads.length} shown</StMono>}>
        {site.unavailable ? <StNotice tone="critical">Messages for {site.siteName} couldn&apos;t be read right now. Reload to check the current records.</StNotice> : site.leads.length === 0 ? <StEmpty>{site.forwarded ? "No forwarded email yet. Each inquiry you forward shows up here with the sender and what they asked." : <>No one has reached out yet. When someone contacts you through {site.siteName}, they show up here with their name and what they asked.</>}</StEmpty> : <InquiryInbox key={`${workspaceId}:${site.key}`} entries={site.leads.map(lead => ({ id: lead.id, name: lead.name, summary: lead.message, at: whenLabel(lead.createdAt), waiting: !!lead.email && data.workspaceReplies === true && !lead.reply, record: <LeadCard lead={lead} workspaceId={workspaceId} tenantId={site.tenantId} bookingProposals={site.bookingProposals} replies={data.workspaceReplies} bookingOffers={data.bookingOffers} /> }))} />}
      </StSection>)}
      {data?.nextPage ? <StTextButton href={`/workspace/inquiries?workspaceId=${encodeURIComponent(workspaceId)}&before=${encodeURIComponent(data.nextPage.before)}&beforeId=${encodeURIComponent(data.nextPage.beforeId)}`}>Earlier inquiries</StTextButton> : null}
      {data?.held ? <HeldSection held={data.held} workspaceId={workspaceId} /> : null}
      {forwarding ? <ForwardInquiries workspaceId={workspaceId} /> : null}
    </>}
  </>;
  return embedded ? <section className="grid gap-6">{content}</section> : <main data-dashboard data-workspace-theme="linen" data-workspace-mode="light"><StPage>{content}</StPage></main>;
}
