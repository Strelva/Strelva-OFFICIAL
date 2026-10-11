"use client";
/** Fictional entry fixtures. No submission, claim, sign-in or email is performed. */
import { useState } from "react";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";
import { OwnerClaimPresentation } from "@/experience/workspace/agency/OwnerClaimAcceptance";
import { StNotice } from "@/components/ui/strelva/Kit";
import type { OwnerClaimPreview } from "@/products/agency-clients/contracts";

export function L13EntryPreview({ view, state }: { view: string; state: string }) {
  const [accepted, setAccepted] = useState(state === "success");
  const [submitted, setSubmitted] = useState(false);
  const preview: OwnerClaimPreview = { workspaceName: "The Mooney Firm", agencyName: "North Studio", recipientEmail: "sheri@example.invalid", status: state === "expired" ? "expired" : state === "revoked" ? "revoked" : "pending", expiresAt: "2026-10-16T12:00:00Z" };
  return <><StNotice>Fictional preview · no access changes, requests or email.</StNotice>{view === "access" ? <div onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); setSubmitted(true); }}><AccessRequestPage key={state + String(submitted)} initialFeedback={{ state: submitted || state === "success" ? "success" : state === "loading" ? "submitting" : state === "error" ? "error" : "idle", email: "sheri@example.invalid", message: submitted || state === "success" ? "Preview request received. No request was sent." : state === "error" ? "This request could not be sent. Your details are kept so you can try again." : undefined, statusUrl: "/preview/strelva/l13-entry?view=access&state=success" }} /></div> : <OwnerClaimPresentation preview={state === "empty" || state === "error" ? null : preview} accepted={accepted ? { workspaceId: "00000000-0000-4000-8000-000000000013", workspaceName: preview.workspaceName, status: "accepted", alreadyAccepted: false } : null} loading={state === "loading"} submitting={state === "submitting"} error={state === "error" ? "This link is missing or no longer works." : state === "permission" ? "Sign in with the verified email this link was sent to." : ""} target="/preview/strelva/l13-entry" onAccept={() => setAccepted(true)} />}</>;
}
