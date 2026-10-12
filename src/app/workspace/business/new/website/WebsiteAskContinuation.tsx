"use client";

import { useState } from "react";
import { StCopy, StNotice, StPill, StTextButton } from "@/components/ui/strelva/Kit";
import { requestDraftKey, writeRequestDraft } from "@/experience/workspace/request-draft";

/** Exact saved Ask message; navigation carries no authority or user-written URL text. */
export function WebsiteAskContinuation({ workspaceId, actorEmail, words, navigate = href => window.location.assign(href) }: {
  workspaceId: string; actorEmail: string; words: string; navigate?: (href: string) => void;
}) {
  const [error, setError] = useState("");
  function open() {
    if (!writeRequestDraft(sessionStorage, requestDraftKey({ workspaceId, actorEmail }), words)) {
      setError("Your words couldn't be carried forward. Allow session storage and try again. The saved conversation is still here.");
      return;
    }
    navigate(`/workspace/site?${new URLSearchParams({ workspaceId, entry: "rebuild" })}`);
  }
  return <><StCopy>{words}</StCopy>{error ? <StNotice tone="critical">{error}</StNotice> : null}<StPill onClick={open}>Prepare a website with this ask</StPill><StTextButton href={`/workspace?workspaceId=${workspaceId}&view=home`}>Back to Home</StTextButton></>;
}
