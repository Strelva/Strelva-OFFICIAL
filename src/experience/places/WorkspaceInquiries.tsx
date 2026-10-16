import { ProposeBookingTimes } from "@/experience/bookings/ProposeBookingTimes";
import { XaAnswers, XaButtonLink, XaEmpty, XaInitial, XaStatus } from "@/components/ui/strelva/Xa";
import { SidePanel, SystemHead } from "@/experience/systems/xa/SystemHead";
import x from "@/experience/systems/xa/system-xa.module.css";
import type { HeldInquiries, HeldView, LeadView, WorkspaceLeads } from "@/products/inquiries/client";
import { REPLY_OUTCOME, WorkspaceInquiryReply } from "./WorkspaceInquiryReply";
import { InquiryInbox } from "./InquiryInbox";
import { HeldInquiryActions } from "./HeldInquiryActions";
import { ForwardInquiries } from "./ForwardInquiries";
import { placeHomeHref, whenLabel, type PlaceState } from "./WorkspacePlace";

/**
 * Inquiries, in the workspace: everyone who reached out through the site,
 * newest first, with a one-tap email reply. The home of /dashboard/leads.
 * XA · S3: people on the left, the open person on the right; status only
 * where someone still waits for a reply.
 */

function sourceLabel(source: string): string {
  const text = source.replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function LeadCard({ lead, workspaceId, tenantId, bookingProposals, replies, bookingOffers, siteName }: { lead: LeadView; workspaceId: string; tenantId: string | null; bookingProposals?: boolean; replies?: boolean; bookingOffers?: boolean; siteName: string }) {
  const waiting = !!lead.email && replies === true && !lead.reply;
  return (
    <article className={x.thread} aria-labelledby={`lead-${lead.id}`}>
      <header className={x.threadHead}>
        <XaInitial name={lead.name} size={40} shape="round" color="var(--st-text)" />
        <div className={x.threadWho}>
          <h3 id={`lead-${lead.id}`} className={x.threadName}>{lead.name}</h3>
          <p className={x.threadMeta}>{[lead.email, lead.source ? sourceLabel(lead.source) : null].filter(Boolean).join(" · ")}{lead.email || lead.source ? " · " : ""}<time dateTime={lead.createdAt}>{whenLabel(lead.createdAt, true)}</time></p>
        </div>
        {waiting ? <XaStatus kind="waits" size="sm">Waits for you</XaStatus> : null}
      </header>
      {lead.message ? <p className={x.bubble} aria-label={`Message from ${lead.name}`}>{lead.message}</p> : null}
      {lead.fields.length ? <XaAnswers labelWidth={150} rows={lead.fields.map(([key, value]) => [sourceLabel(key), value] as const)} /> : null}
      {bookingProposals && tenantId && lead.email ? <ProposeBookingTimes workspaceId={workspaceId} tenantId={tenantId} inquiryId={lead.id} customerName={lead.name} /> : null}
      {lead.releasedRowId ? <div>
        <p className={x.quiet}>Released from held messages.</p>
        <HeldInquiryActions workspaceId={workspaceId} rowId={lead.releasedRowId} name={lead.name} mode="released" />
      </div> : null}
      {replies && lead.reply && Object.hasOwn(REPLY_OUTCOME, lead.reply.status) ? <p role="status" className={x.sentence}>{REPLY_OUTCOME[lead.reply.status]}</p>
        : lead.email && replies && lead.rowId && lead.replyPermission === "none" ? <p className={x.note}>The owner or the assigned team member can reply to this inquiry.</p>
          : lead.email && replies && lead.rowId ? <div className={x.replyForm}><WorkspaceInquiryReply workspaceId={workspaceId} rowId={lead.rowId} name={lead.name} email={lead.email} bookingOffers={bookingOffers && lead.replyPermission !== "member"} member={lead.replyPermission === "member"} /><p className={x.quiet}>Replies go out as {siteName}.</p></div>
            : lead.email ? <div className={x.replyRow}><XaButtonLink href={`mailto:${encodeURIComponent(lead.email).replace(/%40/g, "@")}`}>Reply by email</XaButtonLink><span className={x.quiet}>Opens your own email</span></div> : null}
    </article>
  );
}

/** "Oct 15" in the list; the record keeps the full date and time. */
function shortDay(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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
  return <li className={x.heldItem}>
    <p className={x.threadName}>{item.name}</p>
    <p className={x.threadMeta}><time dateTime={item.createdAt}>{whenLabel(item.createdAt, true)}</time> · {reasonLabel(item.reason)}</p>
    {item.message ? <p className={x.note} data-pre="true">{item.message}</p> : null}
    {item.email ? <p className={x.quiet}>{item.email}</p> : null}
    <HeldInquiryActions workspaceId={workspaceId} rowId={item.rowId} name={item.name} mode="held" />
  </li>;
}

/** Messages Strelva held as spam. Shown only when there is something to decide or the list failed. */
function HeldSection({ held, workspaceId }: { held: HeldInquiries; workspaceId: string }) {
  if (!held.unavailable && held.items.length === 0) return null;
  return <SidePanel title="Held as spam" count={held.items.length} intro="Strelva kept these out of your inbox. If one is a real person, release it. Nobody is emailed either way.">
    {held.unavailable ? <p className={x.sentence} data-tone="waits" role="status">Held messages couldn&apos;t be read right now. Nothing is lost; reload to try again.</p> : <ul className={x.bookingList} aria-label="Held messages">{held.items.map(item => <HeldCard key={item.rowId} item={item} workspaceId={workspaceId} />)}</ul>}
  </SidePanel>;
}

export function WorkspaceInquiries({ workspaceId, state, embedded = false, forwarding = false, head = true }: { workspaceId: string; state: PlaceState<WorkspaceLeads>; embedded?: boolean; forwarding?: boolean; /** False inside a System page, which already says what this is. */ head?: boolean }) {
  const data = state.kind === "ready" ? state.data : null;
  const waiting = data ? data.sites.reduce((n, site) => n + site.leads.filter(lead => !!lead.email && data.workspaceReplies === true && !lead.reply).length, 0) : 0;
  const recent = data && !data.paged ? data.sites.reduce((n, site) => n + (site.unavailable ? 0 : site.lastThirtyDays), 0) : null;
  const meta = data?.durable ? "People who contacted you through your site. Your inquiries stay on record." : "People who contacted you through your site. Strelva keeps the last 90 days here.";
  const content = <>
    {head ? <SystemHead kind="inquiries" title="Inquiries" back={embedded ? undefined : <a className={x.back} href={placeHomeHref(workspaceId)}>‹ Home</a>}
      status={waiting ? { kind: "waits", label: `${waiting} ${waiting === 1 ? "waits" : "wait"} for you` } : undefined} tone={waiting ? "waits" : undefined}
      line={recent !== null ? `${recent} in the last 30 days` : undefined} /> : null}
    {state.kind === "permission" ? <XaEmpty size="sm" pose="alone" title="These inquiries belong to another business" job="Pebble kept them closed to your account" action={<XaButtonLink href="/workspace">Open your workspace</XaButtonLink>}>Your account isn&apos;t a member of this business. Ask its owner to invite you.</XaEmpty>
      : state.kind === "error" ? <XaEmpty size="sm" pose="fixing" title="Inquiries couldn't load" job="Pebble will read them again when you reload">Inquiries couldn&apos;t load. Nothing is lost. Reload to check the current records.</XaEmpty> : <>
        <p className={x.note}>{meta}</p>
        {data?.denied.length ? <p className={x.sentence} data-tone="waits">Your account can&apos;t open {data.denied.map(site => site.siteName).join(", ")} yet. Ask the owner to finish adding you.</p> : null}
        {data && data.sites.length === 0 && data.denied.length === 0 && !forwarding ? <XaEmpty size="sm" pose="resting" title="No inquiries yet" job="Pebble is waiting for a site to send its contact form here">No site is connected to this business yet. Inquiries start once a connected site sends its contact form here.</XaEmpty> : null}
        {data?.sites.map(site => <section key={site.key} className={x.main} id={`site-${site.key.replace(/[^a-z0-9-]/gi, "-")}`} aria-label={site.connected ? `${site.siteName} (your site)` : site.siteName}>
          {data.sites.length > 1 ? <h2 className={x.panelHead}>{site.connected ? `${site.siteName} (your site)` : site.siteName}{site.unavailable ? null : <span>{data.paged ? "" : `${site.lastThirtyDays} in the last 30 days · `}{site.leads.length} shown</span>}</h2> : null}
          {site.unavailable ? <p className={x.sentence} data-tone="waits" role="status">Messages for {site.siteName} couldn&apos;t be read right now. Reload to check the current records.</p>
            : site.leads.length === 0 ? <XaEmpty size="sm" pose="resting" title="No one has reached out yet" job={`Pebble is watching ${site.siteName} for the next message`}>{site.forwarded ? "No forwarded email yet. Each inquiry you forward shows up here with the sender and what they asked." : <>No one has reached out yet. When someone contacts you through {site.siteName}, they show up here with their name and what they asked.</>}</XaEmpty>
              : <InquiryInbox key={`${workspaceId}:${site.key}`} entries={site.leads.map(lead => ({ id: lead.id, name: lead.name, summary: lead.message, at: shortDay(lead.createdAt), waiting: !!lead.email && data.workspaceReplies === true && !lead.reply, record: <LeadCard lead={lead} workspaceId={workspaceId} tenantId={site.tenantId} bookingProposals={site.bookingProposals} replies={data.workspaceReplies} bookingOffers={data.bookingOffers} siteName={site.siteName} /> }))} />}
        </section>)}
        {data?.nextPage ? <p className={x.textLinks}><a href={`/workspace/inquiries?workspaceId=${encodeURIComponent(workspaceId)}&before=${encodeURIComponent(data.nextPage.before)}&beforeId=${encodeURIComponent(data.nextPage.beforeId)}`}>Earlier inquiries</a></p> : null}
        {data?.held ? <HeldSection held={data.held} workspaceId={workspaceId} /> : null}
        {forwarding ? <ForwardInquiries workspaceId={workspaceId} /> : null}
      </>}
  </>;
  return embedded ? <section className={x.screen} data-bare={head ? undefined : true}>{content}</section> : <main data-dashboard data-workspace-theme="linen" data-workspace-mode="light"><div className={x.screen}>{content}</div></main>;
}
