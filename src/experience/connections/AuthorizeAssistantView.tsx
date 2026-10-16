"use client";
/**
 * Connect an assistant (OAuth consent), composed like XA · C2: the business
 * it may work with and the one action on the left; on the felt, Pebble holds
 * the list of what it asks to do and what it never does, as plain lines.
 * The decision is POSTed to the existing authorize endpoint, which re-checks
 * everything.
 */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { XaButton, XaChoices, XaHeadline, XaSays } from "@/components/ui/strelva/Xa";
import { ASSISTANT_NEVER, assistantScope } from "./assistant-scopes";
import { Clay } from "./Clay";
import { FocusedPage } from "./FocusedPage";
import styles from "./xa-connections.module.css";

const subscribeReady = () => () => {};
const controlsReady = () => true;
const serverControlsReady = () => false;

export interface AssistantChoice { workspaceId: string; name: string; agencyId: string | null; agencyName: string | null }

export function AuthorizeAssistantView({ clientName, clientHost, returnHost, params, scopes, choices, request = fetch, navigate = href => window.location.assign(href), mode }: {
  clientName: string; clientHost?: string; returnHost: string; params: Record<string, string>; scopes: string[]; choices: AssistantChoice[];
  request?: typeof fetch; navigate?: (href: string) => void; mode?: "light" | "dark";
}) {
  const available = choices.filter(c => !c.agencyId || scopes.every(s => s === "business:read" || s === "website:code"));
  const ready = useSyncExternalStore(subscribeReady, controlsReady, serverControlsReady);
  const [choice, setChoice] = useState("0"), [busy, setBusy] = useState<"approve" | "deny" | null>(null), [error, setError] = useState<string | null>(null);
  async function decide(decision: "approve" | "deny") {
    setBusy(decision); setError(null);
    try {
      const chosen = available[Number(choice)];
      const r = await request("/api/mcp/oauth/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, params, ...(chosen ? { workspaceId: chosen.workspaceId, agencyId: chosen.agencyId } : {}) }) });
      const body = await r.json();
      if (!r.ok || typeof body.redirectTo !== "string") throw new Error(body.error || "This connection could not be approved.");
      navigate(body.redirectTo);
    } catch {
      setError("This connection couldn’t be approved. Check that you’re signed in and try again. Nothing was shared.");
      setBusy(null);
    }
  }
  const visible = scopes.filter(scope => scope !== "offline_access");
  const permissions = (label: string) => <>
    <p className={styles.linesLabel}>It can</p>
    <ul className={styles.lines} aria-label={`${label}: it can`}>{visible.map(scope => { const item = assistantScope(scope); return <li key={scope} className={styles.line}><span className={styles.lineText}>{item.title}<span className={styles.lineDetail}>{item.detail}</span></span></li>; })}</ul>
    <p className={styles.linesLabel}>Never, without you</p>
    <ul className={styles.lines} aria-label={`${label}: never, without you`}>{ASSISTANT_NEVER.map(item => <li key={item.title} className={styles.line}><Lock size={14} aria-hidden="true" /><span className={styles.lineText}>{item.title}</span><span className={styles.lineEnd}>{item.end}</span></li>)}</ul>
  </>;
  return <FocusedPage label={`Connect ${clientName}`} mode={mode} feltOnPhone={false} who={`Returns you to ${returnHost}`} felt={<>
    <Clay pose="waving" width={300} label={`Pebble holding what ${clientName} asks to do`} />
    <p className={styles.feltTitle}>What {clientName} asks to do</p>
    {permissions(`What ${clientName} asks to do`)}
  </>}>
    <XaHeadline quiet="Choose the business it works with.">Connect {clientName} to Strelva.</XaHeadline>
    {available.length > 1 ? <XaChoices label="Business" value={choice} onChange={setChoice} options={available.map((c, i) => ({ value: String(i), label: c.name, detail: c.agencyName ? `Through ${c.agencyName}` : "You own it" }))} />
      : available.length === 1 ? <p className={styles.copy}>For <strong>{available[0]!.name}</strong>{available[0]!.agencyName ? `, through ${available[0]!.agencyName}` : ""}.</p>
        : <XaSays>You have no current business grant for these permissions. Only a business owner can share customer inquiries or approve pricing.</XaSays>}
    <div className={styles.phoneOnly}><p className={styles.sectionTitle}>What {clientName} asks to do</p>{permissions(`What ${clientName} asks to do`)}</div>
    {error ? <div role="alert"><XaSays>{error}</XaSays></div> : null}
    <div className={styles.stack}>
      <div className={styles.actions}>
        <XaButton variant="primary" size="lg" onClick={() => void decide("approve")} disabled={!ready || !available.length || busy !== null} busy={busy === "approve"}>Connect {clientName}</XaButton>
        <XaButton variant="quiet" size="lg" onClick={() => void decide("deny")} disabled={!ready || busy !== null} busy={busy === "deny"}>Cancel</XaButton>
      </div>
      <p className={styles.small}>It renews for up to 30 days and works only while your business or agency permissions last. Disconnect it in Strelva to end it at once.{clientHost ? ` Strelva checked its identity at ${clientHost}; the name above comes from that assistant.` : ""}</p>
    </div>
  </FocusedPage>;
}

/** Bad news on the consent page keeps Pebble in frame and grants nothing. */
export function AuthorizeStopped({ title, children, mode }: { title: string; children: ReactNode; mode?: "light" | "dark" }) {
  return <FocusedPage label={title} mode={mode} feltOnPhone={false} felt={<Clay pose="fixing" width={320} label="Pebble holding the connection closed" />}>
    <XaHeadline quiet="No assistant access was granted.">{title}</XaHeadline>
    <XaSays>{children}</XaSays>
  </FocusedPage>;
}
