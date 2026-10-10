"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { StHead, StHold, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";

const CONSEQUENCES = [
  { title: "harbor.example.test", detail: "Built and hosted by Strelva", result: "You get the full site as files. It stays up on Strelva for 30 days so you can move it.", editable: true },
  { title: "Domain", detail: "Registered by you at [registrar]", result: "Strelva gives you the 2 records to change back. Strelva never held the domain." },
  { title: "Inquiries form", detail: "Sends to Strelva, then to the owner", result: "Points straight at owner@example.test. No more drafted replies.", editable: true },
  { title: "Session requests", detail: "A System Strelva runs", result: "Stops taking requests. Confirmed sessions stay on the owner’s calendar." },
  { title: "Google listing", detail: "Yours on Google", result: "Stays yours. Strelva’s access is removed." },
  { title: "Google Calendar", detail: "A Connection", result: "Disconnected. Strelva deletes its copy of busy times." },
  { title: "Harbor’s agency", detail: "Your agency", result: "Gets told you left. Keeps nothing of yours unless you share the export." },
];

/** Fictional consequences for the canon only. No provider, billing, deletion or exit command is sent. */
export function PortabilityExitCanon() {
  const [editing, setEditing] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  return <StPage>
    <StHead crumb={{ label: "Business details", href: "/preview/strelva/workspace?view=settings" }} title="Leaving Strelva" meta="Read every line before you go · you can stop at any step" />
    {left ? <StToast>Fictional exit recorded. No real service changed.</StToast> : null}
    <StRows label="Fictional exit consequences">{CONSEQUENCES.map(row => <StRow key={row.title} title={row.title} detail={row.detail} value={<span className="flex items-start gap-4"><ArrowRight size={14} className="mt-1 shrink-0 text-gray-muted" aria-hidden="true" /><span>{row.result}</span></span>} end={row.editable ? <StPill variant="soft" onClick={() => setEditing(row.title)}>Change</StPill> : undefined} />)}</StRows>
    {editing ? <StSurface label="Illustrative exit choice"><div className="flex flex-col gap-4"><p className="text-sm font-medium">{editing}</p><StNotice>This choice is illustrative. Hosting and direct inquiry forwarding are not connected in this preview.</StNotice><StTextButton onClick={() => setEditing(null)}>Keep this choice</StTextButton></div></StSurface> : null}
    <div className="flex flex-wrap items-center justify-between gap-5">
      <p className="max-w-lg text-[13px] leading-5 text-gray-muted">Your export comes first in this fictional example. The 30-day hosting and deletion rules, Google disconnects, and agency notification shown above are illustrative.</p>
      <StHold label={left ? "Fictional exit recorded" : "Hold to leave"} disabled={left} onAccept={() => setLeft(true)} />
    </div>
    <StPillLink variant="soft" href="/preview/strelva/portability?surface=exit&state=actual">See the current exit service</StPillLink>
  </StPage>;
}
