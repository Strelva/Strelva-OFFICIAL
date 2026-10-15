"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { StNotice, StPill, StRows, StRow, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import type { GoogleConnectChoice } from "./GoogleConnect";
import styles from "@/experience/publishing/publishing.module.css";

export type AgencyGoogleResult = "expired" | "forbidden" | "unavailable" | "access_pending" | "no_listings" | "refused";
const messages: Record<AgencyGoogleResult, string> = {
  expired: "This Google listing selection expired or belongs to another session. Find your agency’s listings again.",
  forbidden: "Your agency no longer has access to connect Google for this business. Ask the owner to check your Google area in People & access.",
  unavailable: "Google couldn’t be connected right now. Nothing on the listing changed. Try again.",
  access_pending: "Google hasn’t opened Business Profile access for this connection yet. Nothing was connected. Try again later.",
  no_listings: "That Google account manages no Business Profiles. Try the agency account that manages this business’s listing.",
  refused: "Google sign-in was cancelled or access wasn’t granted. Nothing was connected. Try again.",
};
export interface AgencyGooglePickerProps {
  workspaceId: string;
  choices?: { googleEmail: string; listings: GoogleConnectChoice[]; more: boolean } | null;
  result?: AgencyGoogleResult;
  request?: typeof fetch;
  navigate?: (href: string) => void;
}

/** Lists only a signed discovery; POST checks the exact choice and current agency authority again. */
export function AgencyGooglePicker({ workspaceId, choices, result, request = fetch, navigate = href => window.location.assign(href) }: AgencyGooglePickerProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<AgencyGoogleResult | "signin" | null>(null);
  const inFlight = useRef(false);
  const closed = failure === "expired" || failure === "forbidden" || failure === "signin";
  const restart = `/api/oauth/google/agency?${new URLSearchParams({ workspaceId })}`;
  const back = `/workspace/google?${new URLSearchParams({ workspaceId })}`;
  async function choose(listing: GoogleConnectChoice) {
    if (inFlight.current || closed) return;
    inFlight.current = true; setBusy(`${listing.accountId}/${listing.locationId}`); setFailure(null);
    try {
      const response = await request("/api/oauth/google/agency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, accountId: listing.accountId, locationId: listing.locationId }) });
      const body: unknown = await response.json().catch(() => null);
      const reply = z.object({ url: z.string().url() }).safeParse(body);
      if (response.ok && !response.redirected && reply.success) {
        const url = new URL(reply.data.url);
        if (url.protocol !== "https:" || url.hostname !== "accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.port) throw new Error("Unexpected Google destination");
        navigate(url.href); return;
      }
      const error = z.object({ code: z.string().optional() }).safeParse(body);
      setFailure(response.status === 401 ? "signin" : response.status === 403 ? "forbidden" : error.success && error.data.code === "discovery_expired" ? "expired" : "unavailable");
    } catch { setFailure("unavailable"); }
    finally { inFlight.current = false; setBusy(null); }
  }
  const notice = failure === "signin" ? "Sign in again before connecting Google. Nothing was connected." : failure ? messages[failure] : result ? messages[result] : null;
  return <div className={styles.stack}>
    {notice ? <StNotice tone="critical"><p role="alert" className={styles.copy}>{notice}</p></StNotice> : null}
    {choices && !closed ? <StSection title="Choose this business’s listing" meta={choices.googleEmail}>
      <p className={styles.copy}>These listings are managed by your agency’s Google account. Choose the one for this business. Google asks you to confirm access once more. Nothing on the listing changes.</p>
      <StRows label="Listings managed by your agency’s Google account">{choices.listings.map(listing => <StRow key={`${listing.accountId}/${listing.locationId}`} title={listing.title} detail={listing.address}
        end={<StPill variant="soft" disabled={busy !== null} busy={busy === `${listing.accountId}/${listing.locationId}`} onClick={() => void choose(listing)} aria-label={`Connect ${listing.title}`}>Connect this listing</StPill>} />)}</StRows>
      {choices.more ? <p className={styles.copy}>Only the first {choices.listings.length} listings are shown. Use another account if this business is missing.</p> : null}
    </StSection> : null}
    <div className={styles.actions}>
      {result !== "forbidden" && failure !== "forbidden" && failure !== "signin" ? <StTextButton href={restart}>{choices && !closed ? "Use a different Google account" : "Find your agency’s listings again"}</StTextButton> : null}
      {failure === "signin" ? <StTextButton href={`/sign-in?${new URLSearchParams({ next: `/workspace/google/agency?workspaceId=${workspaceId}` })}`}>Sign in</StTextButton> : null}
      <StTextButton href={back}>Back to this business’s Google listing</StTextButton>
    </div>
  </div>;
}
