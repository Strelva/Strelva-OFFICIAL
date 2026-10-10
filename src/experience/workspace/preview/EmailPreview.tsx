"use client";

import { useRef, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { TextArea } from "@/components/ui/TextInput";
import { StEmpty, StEntry, StHead, StLabel, StMono, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSection, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { renderPaperEmailBody } from "@/lib/email/paper";
import { EMAIL_PREVIEW_CONFIRM_STATES, EMAIL_PREVIEW_CONTEXTS, EMAIL_PREVIEW_TEMPLATES, type EmailConfirmState, type EmailPreviewContext } from "./email-fixture";

const explanatory = ["review", "review-not-yet", "website", "website-not-yet", "possibility", "invitation", "billing", "export", "booking", "dates"];
const readiness = ["loading", "empty", "error", "permission"];
const copy: Partial<Record<EmailConfirmState, { title: string; detail: string }>> = {
  handled: { title: "This was already answered", detail: "Sheri sent a reply to Dana Reyes from Strelva at 9:14 AM. Nothing else will be sent from this link." },
  expired: { title: "This link expired", detail: "Nothing was sent. Open the latest item in Strelva or use your next morning email." },
  changed: { title: "This changed since we emailed you", detail: "The reply in this link is out of date. Nothing was sent. Review the latest reply in Strelva." },
  unverified: { title: "Accepted; confirmation unavailable", detail: "The mail server accepted the reply, but Strelva couldn’t read back the result. Don’t send it again. Open the conversation to check." },
  loading: { title: "Opening this decision", detail: "Nothing sends while this page loads." },
  empty: { title: "Nothing is waiting on you", detail: "There is no open decision here. Nothing was sent." },
  error: { title: "Couldn’t open this decision", detail: "Nothing was sent. Try opening the link again." },
  permission: { title: "This link isn’t for this account", detail: "Open Strelva with the email address this was sent to. Nothing was sent." },
  conversation: { title: "Dana Reyes", detail: "Fictional conversation preview. The inquiry and draft are shown below." },
  review: { title: "Review this reply before posting", detail: "This email preview does not connect to Google. Review and posting stay in the existing signed-link path." },
  "review-not-yet": { title: "Leave the review reply unposted?", detail: "Opening this link did nothing. This is a fictional review decision; nothing is posted or deferred here." },
  "website-not-yet": { title: "Leave the website change unpublished?", detail: "Opening this link did nothing. This is a fictional website decision; nothing is published or deferred here." },
  website: { title: "Review the website change", detail: "Publishing needs its own exact change review. This preview cannot publish a website." },
  possibility: { title: "Try the review invitation", detail: "This is a fictional Possibility. Nothing is sent to clients from this preview." },
  invitation: { title: "Accept your invitation", detail: "The real invitation opens the existing sign-in and exact-email acceptance path. This preview grants no access." },
  billing: { title: "Update your card in billing", detail: "Money changes require sign-in. This preview does not open Stripe or update payment details." },
  export: { title: "Your export is ready", detail: "The production download uses its existing owner-bound link. This preview has no customer archive." },
  booking: { title: "Change or cancel your booking", detail: "Opening this link changes nothing. Booking changes require a separate confirmation on the existing booking page." },
  dates: { title: "Review your session-date request", detail: "Opening a date does not reserve it. The real page asks you to submit a request, then Sheri confirms by email." },
};

/** This isolated interaction changes component state only. No API, token or
 * provider transport is imported; reload restores the fictional starting state. */
export function EmailConfirmPreview({ initialState, context = "urgent" }: { initialState: EmailConfirmState; context?: EmailPreviewContext }) {
  const [state, setState] = useState<EmailConfirmState>(context === "inquiry" && ["confirm", "not-yet", "edit", "sent"].includes(initialState) ? "conversation" : initialState);
  const conversation = EMAIL_PREVIEW_CONTEXTS[context];
  const [draft, setDraft] = useState<string>(conversation.draft);
  const beforeEdit = useRef(draft);
  const result = useRef<HTMLDivElement>(null);
  const transition = (next: EmailConfirmState) => { setState(next); requestAnimationFrame(() => result.current?.focus()); };
  const confirm = state === "confirm" || state === "not-yet";
  const info = state === "handled" ? { title: "This was already answered", detail: `Sheri sent a reply to ${conversation.person} from Strelva at 9:14 AM. Nothing else will be sent from this link.` } : copy[state];
  const footer = <>
    {confirm ? <><StPill size="lg" block onClick={() => transition(state === "not-yet" ? "empty" : "sent")}>{state === "not-yet" ? "Confirm not yet" : "Send reply"}</StPill><div style={{ display: "flex", justifyContent: "space-around", gap: 16 }}><StTextButton onClick={() => transition("not-yet")}>Not yet</StTextButton><StTextButton onClick={() => { beforeEdit.current = draft; transition("edit"); }}>Edit in Strelva</StTextButton></div><StLabel>Link works once, for you only, until its recorded expiry.</StLabel></> : state === "edit" ? <><StPill block onClick={() => transition("confirm")}>Review the reply</StPill><StTextButton onClick={() => { setDraft(beforeEdit.current); transition("confirm"); }}>Cancel editing</StTextButton></> : explanatory.includes(state) ? <StPillLink variant="soft" block href="/preview/strelva/email">Back to email previews</StPillLink> : <StPill variant="soft" block onClick={() => transition("conversation")}>{state === "sent" ? "Open the conversation" : "Open Inquiries in Strelva"}</StPill>}
    <StLabel>Fictional preview · no mail is sent</StLabel>
  </>;
  return <StEntry label="Owner decision preview" footer={footer}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><LogoMark className="size-5" /><strong>The Mooney Firm</strong><StLabel as="span">via Strelva</StLabel></div>
    <div ref={result} tabIndex={-1} style={{ outline: "none" }}>
      <StHead beacon={state === "sent" ? "live" : undefined} title={state === "sent" ? `Sent to ${conversation.person}` : state === "edit" ? `Change your reply to ${conversation.person}` : confirm ? state === "not-yet" ? "Leave this reply unsent?" : `Send this reply to ${conversation.person}?` : state === "conversation" ? conversation.person : info?.title ?? "Review this decision"} meta={confirm ? "Opening this link did nothing yet. The button below confirms your choice." : state === "sent" ? undefined : state === "conversation" ? "Fictional inquiry preview. Nothing sends here." : state === "edit" ? "Your changes stay in this preview until you review them." : info?.detail} />
    </div>
    {state === "loading" ? <><StSkeleton label="Loading decision" /><StSkeleton width="65%" /></> : null}
    {state === "error" || state === "permission" ? <StNotice tone="critical">{info?.detail}</StNotice> : null}
    {state === "empty" ? <StEmpty>No open decisions.</StEmpty> : null}
    {confirm || state === "edit" || state === "conversation" ? <StSurface label={context === "inquiry" ? "Inquiry and recorded outcome" : "Draft reply"}><StMono>To {conversation.address} · From Inquiries &lt;inquiries@mail.strelva.com&gt;</StMono><StLabel>Replies go to sheri@attymooney.com.</StLabel>{state === "conversation" ? <p style={{ margin: "8px 0", fontSize: 15, lineHeight: "24px" }}>{conversation.inquiry}</p> : null}{context === "inquiry" ? <StNotice>Strelva sent the standard first reply with the session link. Saved Priya in Inquiries. There is nothing to decide.</StNotice> : state === "edit" ? <TextArea aria-label="Your reply" value={draft} onChange={event => setDraft(event.target.value)} rows={6} /> : <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: "24px" }}>{draft}</p>}</StSurface> : null}
    {state === "sent" ? <><StRows label="Mail receipt"><StRow title="Accepted by the mail server" end={<StMono>9:14 AM</StMono>} /><StRow title="Sent from" end={<StMono>inquiries@mail.strelva.com</StMono>} /><StRow title="Saved to" end={<StMono>Inquiries · {conversation.person}</StMono>} /></StRows><StLabel>If {conversation.person} writes back, Strelva drafts the next reply and asks you again. “Accepted” doesn’t prove delivery to their inbox.</StLabel></> : null}
    {state === "handled" ? <StNotice>Links work once and stop at their recorded expiry. Anything still waiting is in your next morning email.</StNotice> : null}
  </StEntry>;
}

export function EmailPreview({ template, confirm, state, mode, context }: { context: EmailPreviewContext; template?: string; confirm: boolean; state: EmailConfirmState; mode: "light" | "dark" }) {
  const specimen = template && Object.hasOwn(EMAIL_PREVIEW_TEMPLATES, template) ? EMAIL_PREVIEW_TEMPLATES[template as keyof typeof EMAIL_PREVIEW_TEMPLATES] : undefined;
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode={mode} style={{ minHeight: "100dvh", background: "var(--st-canvas)", color: "var(--st-text)", fontFamily: "var(--font-workspace), system-ui, sans-serif" }}>
    {confirm ? <EmailConfirmPreview key={`${context}:${state}`} initialState={state} context={context} /> : specimen ? readiness.includes(state) ? <StEntry label={`${specimen.name} state preview`} footer={<StTextButton href={`/preview/strelva/email?template=${template}`}>Open the template</StTextButton>}><StHead title={specimen.email.subject} meta="Fictional template state · nothing sends" />{state === "loading" ? <StSkeleton label="Loading email" /> : state === "empty" ? <StEmpty>No email to show.</StEmpty> : <StNotice tone="critical">{state === "permission" ? "You don’t have access to this email." : "Couldn’t load this email. Nothing was sent."}</StNotice>}</StEntry> : <>
      <div style={{ maxWidth: 560, marginInline: "auto", padding: "12px 20px 0", background: specimen.email.white ? "var(--st-surface)" : "var(--st-canvas)" }}><StLabel>Fictional preview · nothing sends</StLabel><StTextButton href="/preview/strelva/email">‹ Inbox</StTextButton></div>
      <main aria-label={specimen.name} style={{ colorScheme: "light" }} dangerouslySetInnerHTML={{ __html: renderPaperEmailBody(specimen.email) }} />
    </> : <StPage><StHead crumb={{ label: "Preview", href: "/preview/strelva" }} title="Emails and the pages they open" meta="Fictional content · templates only · all sending gates unchanged" />
      <StNotice>Email HTML uses tables and inline styles. Owner notifications stay off during rollout. Confirmation controls below only change this fictional preview.</StNotice>
      <StSection title="Templates"><StRows>{Object.entries(EMAIL_PREVIEW_TEMPLATES).map(([key, item]) => <StRow key={key} title={item.name} detail={item.frame} href={`/preview/strelva/email?template=${key}`} end={<StMono>{item.frame}</StMono>} />)}</StRows></StSection>
      <StSection title="One-tap pages"><StRows>{EMAIL_PREVIEW_CONFIRM_STATES.map(item => <StRow key={item} title={item === "confirm" ? "Confirm before sending · xYZON" : item === "sent" ? "Accepted receipt · JSqmy" : item === "handled" ? "Already handled · J2LyNY" : item} href={`/preview/strelva/email?view=confirm&state=${item}`} />)}</StRows></StSection>
      <StSection title="Template states"><StRows>{readiness.map(item => <StRow key={item} title={item} href={`/preview/strelva/email?template=urgent&state=${item}`} />)}</StRows></StSection>
      <StPillLink variant="soft" href="/preview/strelva/email?view=confirm&mode=dark">Confirm page in dark</StPillLink>
    </StPage>}
  </div>;
}
