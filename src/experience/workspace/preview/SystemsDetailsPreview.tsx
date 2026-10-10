"use client";

import { useState } from "react";
import { StEmpty, StHead, StNotice, StPage, StPill, StSection, StSegmented, StTextButton } from "@/components/ui/strelva/Kit";
import { ConnectionDetail } from "@/experience/systems/ConnectionDetail";
import { StoreConnection } from "@/experience/systems/StoreConnection";
import { VersionComparison } from "@/experience/systems/VersionComparison";
import { SystemVersionImprovements } from "@/experience/systems/SystemVersionImprovements";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import { SystemsCanonShell } from "./SystemsCanonShell";
import { appointmentsDifferencesFixture, appointmentsOfferFixture, appointmentsVersionsFixture, calendarConnectionFixture, storeOrdersFixture, type SystemDetailFixtureState } from "./system-details-fixture";
import { createVersionComparisonRequest, VERSION_COMPARISON_IDS } from "./version-comparison-fixture";

export function CalendarConnectionPreview({ state, mode }: { state: SystemDetailFixtureState; mode: "light" | "dark" }) {
  const [message, setMessage] = useState("");
  return <SystemsCanonShell mode={mode} systemName="Google Calendar" pins={[{ id: "website", title: "attymooney.com", href: "/preview/strelva/website", kind: "website" }, { id: "inquiries", title: "Inquiries", href: "/preview/strelva/inquiries", kind: "inquiries" }, { id: "intake", title: "Mediation intake", href: "/preview/strelva/tool", kind: "app" }, { id: "sessions", title: "Mediation sessions", href: "/preview/strelva/sessions", kind: "bookings", current: true }]}>
    <ConnectionDetail detail={calendarConnectionFixture} state={state}
      onDisconnect={state === "ready" ? () => setMessage("Disconnect is not connected to Google in this fictional preview. Nothing changed.") : undefined}
      onAllowAgain={state === "ready" ? () => setMessage("Google account authorization is not available in this fictional preview.") : undefined}
      onRetry={() => setMessage("The preview is showing a simulated read failure. Choose the ready preview to see the contract.")} />
    {message ? <StPage><StNotice>{message}</StNotice></StPage> : null}
  </SystemsCanonShell>;
}

export function ReadOnlyStorePreview({ state, mode }: { state: SystemDetailFixtureState; mode: "light" | "dark" }) {
  const [retry, setRetry] = useState(false);
  return <SystemsCanonShell businessName="Lakeview Yoga" systemName="Store · Square" mode={mode} pins={[{ id: "website", title: "lakeviewyoga.com", href: "/preview/strelva/website", kind: "website" }, { id: "classes", title: "Classes", href: "/preview/strelva/sessions", kind: "bookings" }, { id: "store", title: "Store · Square", href: "/preview/strelva/store", kind: "app", current: true }]}>
    <StoreConnection systemsHref="/preview/strelva?scenario=business&systems=on&view=apps" provider="Square" status="connected" freshness="Read 6 min ago" orders={storeOrdersFixture} state={state} onRetry={() => setRetry(true)} />
    {retry ? <StPage><StNotice>This is a simulated read failure. No Square request was made.</StNotice></StPage> : null}
  </SystemsCanonShell>;
}

export function VersionsComparisonPreview({ state, mode }: { state: SystemDetailFixtureState; mode: "light" | "dark" }) {
  const [review, setReview] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [selection, setSelection] = useState<"downtown" | "amherst">("downtown");
  const [request] = useState(() => createVersionComparisonRequest(state));
  const selected = VERSION_COMPARISON_IDS[selection];
  return <SystemsCanonShell businessName="Harbor Dental" systemName="Appointments" mode={mode} accountName="Dr. Lin" pins={[{ id: "website", title: "harbordental.com", href: "/preview/strelva/website", kind: "website" }, { id: "appointments", title: "Appointments", href: "/preview/strelva/versions", kind: "bookings", current: true }, { id: "inquiries", title: "Inquiries", href: "/preview/strelva/inquiries", kind: "inquiries" }]}>
    {review ? <WorkspaceRequestContext.Provider value={request}>
      <StPage><StHead crumb={{ label: "Appointments", onClick: () => setReview(false) }} title="Review release 13" meta="Each Version keeps its own records, accounts and release decision." />
        <StSegmented label="Location Version" value={selection} onChange={setSelection} options={[{ value: "downtown", label: "Downtown" }, { value: "amherst", label: "Amherst" }]} />
        <StSection title={`${selection === "downtown" ? "Downtown" : "Amherst"} Version`}><SystemVersionImprovements workspaceId={VERSION_COMPARISON_IDS.workspaceId} systemId={selected.systemId} versionId={selected.versionId} readOnly={state === "permission"} /></StSection>
        <StNotice>This release updates this fictional Version only. No reminder is sent.</StNotice>
      </StPage>
    </WorkspaceRequestContext.Provider> : <VersionComparison systemsHref="/preview/strelva?scenario=business&systems=on&view=apps" title="Appointments" meta="One System · a Version for each location · built by North Studio"
      state={state} versions={appointmentsVersionsFixture} differences={appointmentsDifferencesFixture}
      offer={!deferred ? appointmentsOfferFixture : undefined} onReview={() => setReview(true)} onNotNow={() => setDeferred(true)}
      onRetry={() => setReview(true)} />}
    {deferred && !review ? <StPage><StEmpty action={<StPill variant="soft" onClick={() => setDeferred(false)}>Show improvement</StPill>}>This preview has set the offered improvement aside. The current releases stay in place.</StEmpty></StPage> : null}
    {review ? <StPage><StTextButton onClick={() => setReview(false)}>Back to comparison</StTextButton></StPage> : null}
  </SystemsCanonShell>;
}
