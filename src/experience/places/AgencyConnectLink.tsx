"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { StNotice, StPill } from "@/components/ui/strelva/Kit";
import styles from "@/experience/publishing/publishing.module.css";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

const reply = z.union([
  z.object({ kind: z.enum(["first_connect", "reconnect"]), link: z.string().url(), message: z.string() }),
  z.object({ kind: z.enum(["connected", "owner_unknown"]), message: z.string() }),
]);

/** An agency holding the Google area copies a connect link for the owner. Strelva never sends it. */
export function AgencyConnectLinkButton({ workspaceId, request: supplied }: { workspaceId: string; request?: typeof fetch }) {
  const contextRequest = useWorkspaceRequest();
  const request = supplied ?? contextRequest;
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "ready"; message: string; link?: string } | { kind: "error"; message: string }>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);
  async function make() {
    if (inFlight.current) return;
    inFlight.current = true; setState({ kind: "busy" }); setCopied(false);
    try {
      const response = await request("/api/workspace/publishing/google/agency-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const body: unknown = await response.json().catch(() => null);
      const parsed = response.ok ? reply.safeParse(body) : null;
      if (parsed?.success) setState({ kind: "ready", message: parsed.data.message, ...("link" in parsed.data ? { link: parsed.data.link } : {}) });
      else setState({ kind: "error", message: response.status === 403 ? "Your agency needs this business's Google area to make a connect link." : "A connect link couldn't be made. Nothing was sent. Try again." });
    } catch { setState({ kind: "error", message: "A connect link couldn't be made. Nothing was sent. Try again." }); }
    finally { inFlight.current = false; }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setState({ kind: "error", message: "Copy is unavailable. Select the message and copy it manually." }); }
  }
  return <div className={styles.stack}>
    <div className={styles.actions}><StPill variant="soft" busy={state.kind === "busy"} onClick={() => void make()}>Send the owner a connect link</StPill></div>
    {state.kind === "ready" ? <>
      <p className={styles.copy} aria-label="Message for the owner">{state.message}</p>
      {state.link ? <div className={styles.actions}><StPill variant="soft" onClick={() => void copy(state.message)}>{copied ? "Copied" : "Copy message"}</StPill>{copied ? <span role="status" className={styles.copy}>Copied. Send it to the owner yourself.</span> : null}</div> : null}
    </> : null}
    {state.kind === "error" ? <StNotice tone="critical"><p role="alert" className={styles.copy}>{state.message}</p></StNotice> : null}
  </div>;
}
