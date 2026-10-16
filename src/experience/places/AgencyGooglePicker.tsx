"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { Lock } from "lucide-react";
import { XaButton, XaHeadline, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import type { GoogleConnectChoice } from "./GoogleConnect";
import styles from "@/experience/connections/xa-connections.module.css";

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
  const showing = Boolean(choices && !closed);
  return <div className={styles.section}>
    <XaHeadline quiet={showing ? "Nothing on the listing changes." : "Nothing on the listing changed."}>{showing ? "Choose this business’s listing." : "This Google sign-in stopped."}</XaHeadline>
    {notice ? <div role="alert"><XaSays>{notice}</XaSays></div> : null}
    {choices && !closed ? <section className={styles.section} aria-labelledby="agency-google-listings">
      <div className={styles.phoneOnly}>
        <ul className={styles.lines} aria-label="How a Google connection works in Strelva">
          <li className={styles.line}><span className={styles.lineText}>Strelva reads the listing with the account you choose.</span></li>
          <li className={styles.line}><Lock size={14} aria-hidden="true" /><span className={styles.lineText}>Anything that changes on Google</span><span className={styles.lineEnd}>The owner’s yes</span></li>
        </ul>
      </div>
      <div className={styles.sectionHead}><h2 id="agency-google-listings" className={styles.groupLabel}>Listings your agency’s Google account manages</h2><span className={styles.sectionMeta}>{choices.googleEmail} · Google asks you to confirm once more</span></div>
      <ul className={styles.group} aria-label="Listings managed by your agency’s Google account">{choices.listings.map(listing => {
        const key = `${listing.accountId}/${listing.locationId}`;
        return <li key={key} className={styles.groupRow}>
          <span className={styles.groupText}><span className={styles.groupTitle}>{listing.title}</span>{listing.address ? <span className={styles.groupDetail}>{listing.address}</span> : null}</span>
          <span className={styles.groupEnd}><XaButton size="sm" disabled={busy !== null} busy={busy === key} onClick={() => void choose(listing)} aria-label={`Connect ${listing.title}`}>Connect this listing</XaButton></span>
        </li>;
      })}</ul>
      <p className={styles.small}>No message is sent to the owner.{choices.more ? ` Only the first ${choices.listings.length} listings are shown; use another account if this business is missing.` : ""}</p>
    </section> : null}
    <div className={styles.actions}>
      {result !== "forbidden" && failure !== "forbidden" && failure !== "signin" ? <XaTextLink href={restart}>{choices && !closed ? "Use a different Google account" : "Find your agency’s listings again"}</XaTextLink> : null}
      {failure === "signin" ? <XaTextLink href={`/sign-in?${new URLSearchParams({ next: `/workspace/google/agency?workspaceId=${workspaceId}` })}`}>Sign in</XaTextLink> : null}
      <XaTextLink href={back}>Back to this business’s Google listing</XaTextLink>
    </div>
  </div>;
}
