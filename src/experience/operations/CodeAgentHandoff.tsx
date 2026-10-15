"use client";

import { useState } from "react";
import { StMono, StPill, StSection } from "@/components/ui/strelva/Kit";
import styles from "./delivery-panel.module.css";

/** One line to copy and what it is for, with an honest result of the copy. */
function CopyBlock({ label, note, text }: { label: string; note?: string; text: string }) {
  const [status, setStatus] = useState<"copied" | "failed" | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus("copied"); } catch { setStatus("failed"); }
  }
  return <div className={styles.copyBlock}>
    <p className={styles.copyLabel}>{label}</p>
    <div className={styles.copyText}><StMono>{text}</StMono></div>
    {note ? <p className={styles.copyNote}>{note}</p> : null}
    <div className={styles.copyActions}>
      <StPill variant="soft" onClick={() => void copy()}>Copy</StPill>
      {status ? <span role="status">{status === "copied" ? "Copied" : "Copy failed. Select the text and copy it."}</span> : null}
    </div>
  </div>;
}

/**
 * Hand a website Request to the agency's own coding agent: connect it once,
 * then tell it which Request to pick up. It cannot approve or make anything live.
 */
export function CodeAgentHandoff({ mcpUrl, requestId }: { mcpUrl: string; requestId: string }) {
  return <StSection title="Hand it to your coding agent">
    <CopyBlock label="Connect it" note="Once per computer. Sign in as yourself and choose this client." text={`claude mcp add --transport http strelva ${mcpUrl}`} />
    <CopyBlock label="Then ask it" text={`Pick up Strelva Request ${requestId}. Use read_site_request, build it on a branch, then report_site_preview. Don't merge until the owner makes it live; then deploy and report_site_deploy.`} />
    <p className={styles.copyNote}>Your agency accepts the Request here first. The coding agent can&apos;t approve or make anything live.</p>
  </StSection>;
}
