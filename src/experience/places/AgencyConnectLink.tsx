"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { StNotice, StPill, StPillLink } from "@/components/ui/strelva/Kit";
import styles from "@/experience/publishing/publishing.module.css";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

const reply = z.union([
  z.object({ kind: z.enum(["first_connect", "reconnect", "agency_connect"]), link: z.string().url(), message: z.string() }),
  z.object({ kind: z.enum(["connected", "owner_unknown"]), message: z.string() }),
]);

/** Agency credentials and copied owner messages are distinct, deliberate actions. Nothing is sent. */
export function AgencyConnectLinkButton({ workspaceId, request: supplied }: { workspaceId: string; request?: typeof fetch }) {
  const contextRequest = useWorkspaceRequest();
  const request = supplied ?? contextRequest;
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "ready"; message: string; link?: string; agency?: boolean } | { kind: "error"; message: string }>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const inFlight = useRef(false);
  async function make() {
    if (inFlight.current) return;
    inFlight.current = true; setState({ kind: "busy" }); setCopied(false); setCopyFailed(false);
    try {
      const response = await request("/api/workspace/publishing/google/agency-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const body: unknown = await response.json().catch(() => null);
      const parsed = response.ok && !response.redirected ? reply.safeParse(body) : null;
      if (parsed?.success) {
        const data = parsed.data;
        if (data.kind === "agency_connect") {
          const url = new URL(data.link);
          if (url.origin !== window.location.origin || url.pathname !== "/api/oauth/google/agency" || url.searchParams.get("workspaceId") !== workspaceId) throw new Error("Unexpected connect destination");
          setState({ kind: "ready", message: data.message, link: url.pathname + url.search, agency: true });
        } else setState({ kind: "ready", message: data.message, ...("link" in data ? { link: data.link } : {}) });
      } else setState({ kind: "error", message: response.status === 401 ? "Sign in again to check Google access." : response.status === 403 ? "Your agency needs this business's Google area to connect an account or make an owner link." : response.status === 409 ? "Google isn't available through your current access. Check Connections, then try again." : "Google access couldn't be checked. Nothing was sent. Try again." });
    } catch { setState({ kind: "error", message: "Google access couldn't be checked. Nothing was sent. Try again." }); }
    finally { inFlight.current = false; }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }
  return <div className={styles.stack}>
    <div className={styles.actions}><StPill variant="soft" busy={state.kind === "busy"} onClick={() => void make()}>Check Google connection options</StPill></div>
    {state.kind === "ready" ? <>
      <p className={styles.copy} aria-label={state.agency ? "Agency Google connection" : "Message for the owner"}>{state.message}</p>
      {state.link ? state.agency ? <div className={styles.actions}><StPillLink href={state.link}>Connect your agency’s Google account</StPillLink></div> : <div className={styles.actions}><StPill variant="soft" onClick={() => void copy(state.message)}>{copied ? "Copied" : "Copy message"}</StPill>{copied ? <span role="status" className={styles.copy}>Copied. Send it to the owner yourself.</span> : null}</div> : null}
      {copyFailed ? <p role="status" className={styles.copy}>Copy is unavailable. Select the message above and copy it manually.</p> : null}
    </> : null}
    {state.kind === "error" ? <StNotice tone="critical"><p role="alert" className={styles.copy}>{state.message}</p></StNotice> : null}
  </div>;
}
