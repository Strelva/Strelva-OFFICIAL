"use client";

import { useState } from "react";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { ReleaseFlagsPanel } from "@/app/admin/clients/[id]/ReleaseFlagsPanel";
import { OwnerInvitationsPanel } from "@/app/admin/clients/[id]/OwnerInvitationsPanel";
import { UptimeBoard } from "@/app/admin/uptime/UptimeBoard";
import { StCell, StComposerBar, StComposerDock, StEmpty, StHead, StHold, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState, StSteps, StSurface, StGrid, StTextButton } from "@/components/ui/strelva/Kit";
import { CONVERSION_ROWS, OPERATOR_CLIENTS, OPERATOR_TIME, operatorCheckFixture, operatorInvitationFixture, operatorReleaseFixture } from "./operator-fixture";
import styles from "@/experience/operations/operator-client.module.css";

export type OperatorPreviewSurface = "client" | "convert" | "checks" | "ask";
export function OperatorPreview({ surface, scenario, client }: { surface: OperatorPreviewSurface; scenario?: string; client?: string }) {
  const [release, setRelease] = useState(operatorReleaseFixture);
  const [reasonReceipt, setReasonReceipt] = useState("");
  const [dryRun, setDryRun] = useState<"ready" | "running" | "done">("ready");
  const [ask, setAsk] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const title = surface === "checks" ? OPERATOR_DESTINATIONS.checks.label : surface === "convert" ? "Convert Lakeview Yoga" : surface === "ask" ? "Strelva Agency → The Mooney Firm" : OPERATOR_CLIENTS.find(item => item.id === client)?.siteName ?? "The Mooney Firm";
  if (scenario === "loading" || scenario === "error" || scenario === "denied" || scenario === "empty") return <StPage><StHead title={title} />{scenario === "loading" ? <><StSkeleton label={`Reading ${title}`} width="70%" /><StSkeleton width="40%" /></> : scenario === "error" ? <StNotice tone="critical">{title} could not be read. No changes were made. <StTextButton href={`?scenario=ready`}>Try again</StTextButton></StNotice> : scenario === "denied" ? <StEmpty>{surface === "ask" ? "Strelva Agency membership and client access must be verified. Operator access grants no agency seat." : "Operators only. Sign in with a verified Strelva operator account and the required business access."}</StEmpty> : <StEmpty>{surface === "client" ? "No site record is available." : surface === "checks" ? "No active client sites to check." : surface === "convert" ? "No old site records to convert." : "No conversation is included in this fictional preview."}</StEmpty>}</StPage>;
  if (surface === "client" && client && client !== "mooney") return <StPage><StHead crumb={{ label: OPERATOR_DESTINATIONS.sites.label, href: "/preview/strelva/operator-client" }} title={title} /><StEmpty action={client === "lakeview" ? <StTextButton href="/preview/strelva/operator-convert">Open conversion dry run</StTextButton> : <StTextButton href="/preview/strelva/operator-client">Open The Mooney Firm specimen</StTextButton>}>No detailed records are included for this fictional site.</StEmpty></StPage>;
  const previewRequest: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (surface === "checks") return Response.json({ results: operatorCheckFixture(), scannedAt: OPERATOR_TIME });
    if (body.kind === "flag" && release.linked) {
      const next = { ...release, flags: release.flags.map(flag => flag.flag === body.flag ? { ...flag, row: body.state === "unset" ? null : body.state, effective: body.state === "unset" ? "off" : body.state, revision: flag.revision + 1 } : flag) };
      setRelease(next); setReasonReceipt(`Fictional platform release change by Strelva: ${body.reason}`);
      return Response.json(next);
    }
    if (body.kind === "tester" && release.linked) { const next = { ...release, testerEmails: body.present ? [...release.testerEmails, body.email] : release.testerEmails.filter(email => email !== body.email) }; setRelease(next); return Response.json(next); }
    return Response.json({ error: "Fixture only. No invitation or outside write was made." }, { status: 409 });
  };
  if (surface === "checks") return <UptimeBoard initialResults={operatorCheckFixture()} initialScannedAt={OPERATOR_TIME} request={previewRequest} preview />;
  if (surface === "client") return <StPage><StHead crumb={{ label: OPERATOR_DESTINATIONS.sites.label, href: "/preview/strelva/operator-queue" }} title={title} meta="Fictional workspace since Oct 2 · Served by Strelva Agency · Sheri is the owner" />
    <div className={styles.columns}><ReleaseFlagsPanel tenantId="mooney" initialState={release} request={previewRequest} /><aside className={styles.aside}>
      <StSection title="Owner"><StRows><StRow title="Sheri" detail="sheri@example.test · signed in Oct 4" /></StRows><OwnerInvitationsPanel tenantId="mooney" load={operatorInvitationFixture()} request={previewRequest} /></StSection>
      <StSection title="Strelva Agency seat"><StTextButton href="/preview/strelva/operator-ask">Ask from Strelva Agency → The Mooney Firm</StTextButton><StTextButton href="/preview/strelva/operator-convert">See conversion dry run</StTextButton><p>Client work uses ordinary business or agency permissions.</p></StSection>
    </aside></div>{reasonReceipt && <StNotice>{reasonReceipt}. No saved data changed.</StNotice>}
  </StPage>;
  if (surface === "convert") return <StPage><StHead crumb={{ label: OPERATOR_DESTINATIONS.sites.label, href: "/preview/strelva/operator-client?client=lakeview" }} title={title} beacon="draft" meta={dryRun === "running" ? "Reading the fictional dry run…" : dryRun === "done" ? "Fictional conversion complete · no saved data changed" : "Dry run finished 2:20 PM · nothing has moved yet"} />
    {dryRun === "running" ? <StSteps label="Conversion dry run" steps={[{ title: "Read the old client records", state: "active" }, { title: "Match records to Systems", state: "pending" }, { title: "Show anything that needs a decision", state: "pending" }]} /> : <StGrid label="Fictional conversion dry run" columns={["Old page", "New home", "What carries over"]}>{CONVERSION_ROWS.map(row => <tr key={row.from}><StCell label="Old page"><StMono>{row.from}</StMono></StCell><StCell heading label="New home">→　{row.to}</StCell><StCell label="What carries over">{row.warning ? <StState kind="need">{row.detail}</StState> : row.detail}</StCell></tr>)}</StGrid>}
    <div className="flex flex-wrap items-center gap-4"><p className="flex-1 text-sm text-gray-muted">After converting, old /dashboard pages show a way back to the workspace. Nothing is deleted.</p><StPill variant="soft" disabled={dryRun === "running"} onClick={() => { setDryRun("running"); window.setTimeout(() => setDryRun("ready"), 800); }}>Run again</StPill><StHold label={dryRun === "done" ? "Preview converted" : "Hold to convert preview"} disabled={dryRun !== "ready"} onAccept={() => setDryRun("done")} /></div>
    <StNotice>Fictional dry run only. No operator conversion endpoint exists. Real conversion uses an authorized agency with an explicit source selection and reviewed record digest.</StNotice>
  </StPage>;
  return <><StPage><StHead title="Strelva Agency → The Mooney Firm" meta="Served by Strelva Agency · Runs on Strelva" />
    <StNotice tone="need">You’re asking through Strelva Agency’s agency seat for The Mooney Firm. Sheri sees who asked. Strelva Agency prepares the draft; Sheri alone decides.</StNotice>
    <StSurface label="Fictional request">The About page photo is 4 MB and the page takes 2.1 s. Make it smaller.</StSurface>
    <StSection title="Strelva Agency · Runs on Strelva"><p className="text-sm text-gray-muted">Done as a draft. The photo looks the same and is now 180 KB. It’s a website change, so it waits for Sheri in Needs you, marked as asked by you.</p><StRows><StRow title="Waiting on The Mooney Firm · Smaller About photo" detail="Asked by Strelva Agency · Runs on Strelva" end={<StTextButton href="/preview/strelva/operator-client">Open site support ↗</StTextButton>} /></StRows></StSection>
    {question && <StSurface label="Your fictional request">{question}</StSurface>}{answer && <StNotice>{answer}</StNotice>}
    <StNotice>Fictional conversation. No photo was changed. Real client requests use the business or agency workspace and its existing permissions.</StNotice>
  </StPage><StComposerDock><StComposerBar scope="Strelva Agency → The Mooney Firm" placeholder="Ask through Strelva Agency’s seat" value={ask} onChange={setAsk} onSubmit={() => { setQuestion(ask); setAnswer(/^(yes|approve|publish)$/i.test(ask.trim()) ? "A typed yes approves nothing. Sheri must use the change’s own control in Needs you." : "This preview keeps your words here. No request was sent and no draft was saved."); setAsk(""); }} /></StComposerDock></>;
}
