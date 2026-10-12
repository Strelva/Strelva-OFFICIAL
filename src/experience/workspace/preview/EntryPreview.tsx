"use client";

/** Fictional identity and businesses. These forms never call auth or send email. */
import { StChoiceCards } from "@/components/ui/strelva/ChoiceCards";
import { useState } from "react";
import { StEntry, StHead, StField, StPill, StPillLink, StTextButton, StSurface, StNotice, StMono, StSkeleton, StEmpty } from "@/components/ui/strelva/Kit";
import { DashboardBackBar } from "../DashboardBackBar";

export function EntryPreview({ view, state }: { view: string; state: string }) {
  const [kind, setKind] = useState("agency");
  const [email, setEmail] = useState("sheri@example.invalid");
  const [submitted, setSubmitted] = useState(false);
  const [note, setNote] = useState("");
  if (view === "back-bar") return <><DashboardBackBar businessName="The Mooney Firm" homeHref="/preview/strelva?scenario=business" route="/dashboard/schedule" /><StNotice>Fictional legacy page. Only the back bar belongs to this preview.</StNotice></>;
  const previewNotice = <p className="text-sm text-gray-muted">Local interface preview · fictional accounts · no live actions</p>;
  return <StEntry brand={view === "admin-host" ? "The Mooney Firm" : undefined} brandFontFamily={view === "admin-host" ? "Georgia, serif" : undefined} host={view === "admin-host" ? "admin.attymooney.com" : undefined} helpHref="/preview/strelva">
    {state === "loading" ? <><StHead title="Opening your account" /><StSkeleton label="Loading entry" /></>
      : state === "error" ? <><StHead title="Entry unavailable" /><StNotice tone="critical">Sign-in could not be loaded. Try again.</StNotice><StPill variant="soft" onClick={() => setSubmitted(true)}>Retry</StPill>{submitted ? <StNotice>Fictional sign-in remains unavailable.</StNotice> : null}</>
        : state === "empty" ? <><StHead title="No invitation found" /><StEmpty>Ask the business owner for a new invitation.</StEmpty></>
          : view === "check-email" || (view === "sign-up" && submitted) || (view === "admin-host" && submitted) ? <><StHead title="Check your email" meta="We sent a sign-in link to" /><StMono tone="text">{email}</StMono><div className="flex flex-wrap gap-3"><StPillLink href="https://mail.google.com" variant="soft">Open Gmail</StPillLink><StPillLink href="https://outlook.live.com/mail" variant="soft">Open Outlook</StPillLink></div><div className="flex flex-wrap gap-5"><StTextButton tone="accent" onClick={() => setNote("Preview link prepared. Nothing was sent.")}>Send again</StTextButton><StTextButton tone="accent" onClick={() => setSubmitted(false)}>Use a different email</StTextButton></div>{note ? <StNotice>{note}</StNotice> : null}</>
            : view === "invite" ? <><StHead title="The Mooney Firm invited North Studio" meta="Invited by sheri · Builder access" /><p className="text-sm text-gray-muted">You can see their Systems and build what they ask for. They approve anything before it goes live, and can remove you without losing their work.</p><StPill block onClick={() => setSubmitted(true)}>Continue as you@agency.com</StPill><StTextButton href="/preview/strelva">Not now</StTextButton>{submitted ? <StNotice>Preview invitation accepted. No access changed.</StNotice> : null}</>
              : view === "no-access" || state === "permission" ? <><StSurface><div className="flex items-center justify-between gap-3"><StMono tone="text">you@agency.com</StMono><StTextButton href="/preview/strelva/entry?view=sign-up" tone="accent">Switch account</StTextButton></div></StSurface><StHead title="You don’t have access to Lakeview Yoga" meta="Lakeview Yoga decides who can open their workspace. Ask them, and they’ll see your note." /><form onSubmit={event => { event.preventDefault(); setSubmitted(true); }} className="flex flex-col gap-5"><StField label="Note to the owner (optional)"><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="I’m with North Studio, helping with…" rows={3} /></StField><StPill type="submit" block>Request access</StPill></form>{submitted ? <StNotice>Preview request recorded. Nothing was sent to an owner.</StNotice> : null}</>
                : <><StHead title={view === "admin-host" ? "Manage attymooney.com" : "Create your account"} meta={view === "admin-host" ? "For Sheri and the people Sheri added. Visitors looking for the firm want attymooney.com." : undefined} />
                  {view !== "admin-host" ? <StChoiceCards label="Who is this for?" value={kind} onChange={setKind} options={[
                    { value: "business", label: "I run a business", detail: "Run your site, forms and bookings yourself. Bring in an agency anytime." },
                    { value: "agency", label: "I build for clients", detail: "You’re an agency. Clients own their workspace; you work inside it." },
                  ]} /> : null}
                  <form onSubmit={event => { event.preventDefault(); setSubmitted(true); }} className="flex flex-col gap-5"><StField label={view === "admin-host" ? "Email" : "Work email"}><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></StField><StPill type="submit" block>{view === "admin-host" ? "Email me a sign-in link" : "Continue"}</StPill></form>
                  <StTextButton href="/sign-in">Already have an account? Sign in</StTextButton>
                </>}
    {previewNotice}
  </StEntry>;
}
