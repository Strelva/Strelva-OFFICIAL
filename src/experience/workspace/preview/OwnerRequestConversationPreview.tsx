"use client";

import { useState } from "react";
import { TextArea } from "@/components/ui/TextInput";
import { StMono, StNotice, StPill, StSection, StSurface } from "@/components/ui/strelva/Kit";

/** Illustrative request context only; there is no saved conversation API yet. */
export function OwnerRequestConversationPreview({ readOnly = false }: { readOnly?: boolean }) {
  const [reply, setReply] = useState("");
  const [draft, setDraft] = useState("");
  return <>
    <StSection title="Outside this request">
      <StSurface label="Fictional scope exclusions"><p>Adding online payments or replacing the workshop’s booking calendar. These need a separate scope and date.</p></StSurface>
    </StSection>
    <StSection title="About this request">
      <p className="text-sm text-gray-muted">Fictional conversation · these messages illustrate the request page. They are not saved business records.</p>
      <div className="space-y-5">
        <article aria-label="Fictional Strelva message"><p><strong>Strelva</strong> <StMono>Oct 8</StMono></p><p>The service page currently lists Saturday appointments. Should the rebuilt website keep that wording?</p></article>
        <article aria-label="Fictional owner message"><p><strong>Fictional owner</strong> <StMono>Oct 8</StMono></p><p>Keep it. Saturday appointments are available by request.</p></article>
      </div>
      {readOnly ? <StNotice>Shared with you. You can read this fictional conversation.</StNotice> : <StSurface label="Local reply draft"><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (reply.trim()) setDraft(reply.trim()); }}>
        <TextArea label="Reply about this request" value={reply} maxLength={3000} onChange={event => { setReply(event.target.value); setDraft(""); }} />
        <StPill type="submit" variant="soft" disabled={!reply.trim()}>Save local reply draft</StPill>
        <p className="text-sm text-gray-muted">This draft stays in this preview. It sends no message and approves no change.</p>
      </form></StSurface>}
      {draft ? <StNotice><p role="status">Local reply draft prepared. Nothing was sent or approved.</p><p>{draft}</p></StNotice> : null}
    </StSection>
  </>;
}
