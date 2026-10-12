"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { expectedConnectedSiteSystemId } from "@/products/connected-sites/client";
import { StEmpty, StHead, StMono, StNotice, StPage, StPill, StPillLink, StRows, StRow, StSection, StState, StSteps, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./connected-sites.module.css";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { PLATFORMS, type SitePlatform } from "@/products/connected-sites/contracts";
import { GUIDE_ORDER, installGuide, installStepsText } from "@/products/connected-sites/install-guides";
import { beginFocusRecovery, type FocusRecovery } from "@/experience/websites/focus-recovery";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

export interface ConnectableSite {
  id: string;
  siteHost: string;
  siteUrl: string;
  status: "active" | "revoked";
  verifiedAt: string | null;
  systemId: string;
  snippet: { script: string; meta: string | null };
  /** What the owner said the site is built with, when known. */
  platform?: SitePlatform;
}

const PLATFORM_OPTIONS = GUIDE_ORDER.filter(value => (PLATFORMS as readonly string[]).includes(value)).map(value => ({ value, label: installGuide(value).label }));
const UNCONFIRMED_CONNECTION = "We couldn't confirm the connection's current state. Reload the page to check before trying again.";
const connectedResponse = z.object({ site: z.object({
  id: z.string().uuid(), siteHost: z.string().min(1), siteUrl: z.string().url(), status: z.enum(["active", "revoked"]),
  verifiedAt: z.string().nullable(), systemId: z.string().uuid(), snippet: z.object({ script: z.string(), meta: z.string().nullable() }),
  platform: z.enum(PLATFORMS).optional(),
}) });
// Confirmation mirrors normalizeSiteUrl's stored address; the server owns validation.
function submittedAddress(raw: string): { siteUrl: string; siteHost: string } | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return { siteUrl: `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`, siteHost: url.hostname.toLowerCase().replace(/\.$/, "") };
  } catch { return null; }
}
const errorResponse = z.object({ error: z.string() });

/**
 * A new business brings the website it already has (website System spec,
 * decision 3 working default). Address → two lines to paste → Strelva reads
 * the live page to confirm the site is theirs → the website opens as a
 * System. Strelva never edits the pages. Every call is rechecked on the server.
 */
export function ConnectSiteExperience(props: { workspaceId: string; canManage: boolean; initialSites: ConnectableSite[]; appBase?: string; /** The business's one website (owner door). */ initialUrl?: string }) {
  return <ConnectSiteExperienceContent key={props.workspaceId} {...props} />;
}

function ConnectSiteExperienceContent({ workspaceId, canManage, initialSites, appBase = "", initialUrl = "" }: Parameters<typeof ConnectSiteExperience>[0]) {
  const request = useWorkspaceRequest();
  const [site, setSite] = useState<ConnectableSite | null>(() => initialSites.find(item => item.status === "active") ?? null);
  const [sites, setSites] = useState(initialSites.filter(item => item.status === "active"));
  const [url, setUrl] = useState(initialUrl);
  const [platform, setPlatform] = useState<SitePlatform>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState<SitePlatform | null>(null);
  const [stepsCopied, setStepsCopied] = useState(false);
  const inFlight = useRef(false);
  const needsReload = useRef(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  const reloadAction = useRef<HTMLButtonElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const recovery = useRef<FocusRecovery | null>(null);
  useEffect(() => () => recovery.current?.cancel(), []);
  useEffect(() => {
    if (!busy && recovery.current) {
      recovery.current.recover(unconfirmed ? reloadAction.current : error ? alert.current : resultHeading.current, unconfirmed);
      recovery.current = null;
    }
  }, [busy, unconfirmed, error]);
  const systemPage = (systemId: string) => `${appBase}/workspace?${new URLSearchParams({ view: "system", system: systemId, workspaceId })}`;

  function uncertain(message?: string) {
    needsReload.current = true; setUnconfirmed(true);
    setError([message, UNCONFIRMED_CONNECTION].filter(Boolean).join(" "));
  }

  async function post(body: Record<string, unknown>, expectedSite?: ConnectableSite): Promise<ConnectableSite | null> {
    const response = await request("/api/workspace/connected-sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
    const raw: unknown = await response.json().catch(() => null);
    const parsed = connectedResponse.safeParse(raw), error = errorResponse.safeParse(raw);
    const result = parsed.success ? parsed.data : null;
    const message = error.success ? error.data.error : undefined;
    const address = body.action === "connect" ? submittedAddress(String(body.siteUrl)) : null;
    const expectedSystemId = response.ok && result ? await expectedConnectedSiteSystemId(workspaceId, result.site.id) : null;
    const exact = result && result.site.status === "active" && result.site.systemId === expectedSystemId && (body.action === "verify"
      ? expectedSite && result.site.id === body.siteId && result.site.systemId === expectedSite.systemId
        && result.site.siteUrl === expectedSite.siteUrl && result.site.siteHost === expectedSite.siteHost
      : address && result.site.siteUrl === address.siteUrl && result.site.siteHost === address.siteHost);
    if (!response.ok || !result || !exact) {
      const held = response.status === 503 && message === "Connected sites are not enabled. Nothing changed.";
      // The store can report a malformed saved row as 400 after SQL commits.
      // Unconfirmed writes have no replay key: inspect fresh state on reload.
      if (!held && (response.ok || response.status === 400 || response.status >= 500 || !message)) uncertain(message);
      else setError(message || UNCONFIRMED_CONNECTION);
      return null;
    }
    setSites(items => [...items.filter(item => item.id !== result.site.id), result.site]);
    return result.site;
  }
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!canManage || inFlight.current || needsReload.current) return;
    if (!url.trim()) { setError("Enter your site's address, like yourbusiness.com."); return; }
    inFlight.current = true; recovery.current = beginFocusRecovery(scope.current); setBusy(true); setError("");
    try { const next = await post({ action: "connect", siteUrl: url.trim(), platform }); if (next) setSite(next); }
    catch { uncertain(); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function verify() {
    if (!site || !canManage || inFlight.current || needsReload.current) return;
    inFlight.current = true; recovery.current = beginFocusRecovery(scope.current); setBusy(true); setError("");
    try { const next = await post({ action: "verify", siteId: site.id }, site); if (next) setSite(next); }
    catch { uncertain(); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function copy() {
    if (!site) return;
    try { await navigator.clipboard.writeText([site.snippet.meta, site.snippet.script].filter(Boolean).join("\n")); setCopied(true); }
    catch { setError("Copy is unavailable. Select the lines and copy them manually."); }
  }
  // The guide follows what the owner chose; they can switch it without changing the saved site.
  const shownPlatform: SitePlatform = guidePlatform ?? site?.platform ?? platform;
  const guide = installGuide(shownPlatform);
  async function copySteps() {
    if (!site) return;
    const lines = [site.snippet.meta, site.snippet.script].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(installStepsText({ platform: shownPlatform, siteHost: site.siteHost, lines })); setStepsCopied(true); }
    catch { setError("Copy is unavailable. Select the steps and copy them manually."); }
  }

  return <div ref={scope}><StPage>
    <StHead crumb={{ label: "Systems", href: `${appBase}/workspace?${new URLSearchParams({ workspaceId })}` }} title={site ? `Connect ${site.siteHost}` : "Bring the website you already have"}
      meta="Keep your site where it is. Strelva fills in your confirmed details, takes its inquiries and counts visits. It never edits your pages." />
    {sites.length ? <div className={styles.stack}>
      <SelectInput label="Connected website" value={site?.id ?? ""} options={[{ value: "", label: "Connect another website" }, ...sites.map(item => ({ value: item.id, label: item.siteHost }))]} onChange={event => { if (!inFlight.current && !needsReload.current) { setSite(sites.find(item => item.id === event.target.value) ?? null); setError(""); setCopied(false); setStepsCopied(false); setGuidePlatform(null); } }} disabled={busy || unconfirmed} />
      {site && canManage ? <StTextButton disabled={busy || unconfirmed} onClick={() => { if (!inFlight.current && !needsReload.current) { setSite(null); setError(""); setCopied(false); } }}>Connect another website</StTextButton> : null}
    </div> : null}
    {!site ? canManage ? <StSurface label="Connect your website"><form className={styles.stack} onSubmit={connect} noValidate aria-label="Connect your website">
      <TextInput label="Your site's address" type="url" inputMode="url" autoComplete="url" placeholder="yourbusiness.com" value={url} readOnly={busy || unconfirmed} spellCheck={false} autoCapitalize="none" onChange={event => { if (!inFlight.current && !needsReload.current) { setUrl(event.target.value); setError(""); } }} />
      <SelectInput label="Built with" value={platform} options={PLATFORM_OPTIONS} disabled={busy || unconfirmed} onChange={event => { if (!inFlight.current && !needsReload.current) setPlatform(event.target.value as SitePlatform); }} />
      <div><StPill type="submit" busy={busy} disabled={unconfirmed}>Get my two lines</StPill></div>
    </form></StSurface> : <StEmpty>An owner or admin of this business connects its website.</StEmpty>
    : <>
      <div className={styles.installGrid}>
        <StSurface label="Lines to add to your site"><div className={styles.stack}>
          <h2 ref={resultHeading} tabIndex={-1} id={site.verifiedAt ? "connected-done" : "connected-install"} className="text-base font-semibold">{site.verifiedAt ? `${site.siteHost} is connected` : `Add these two lines to ${site.siteHost}`}</h2>
          {site.verifiedAt ? <><StState kind="live">Connected</StState><p className={styles.body}>The site stays with your current provider. Its connection to Strelva is verified.</p></> : <>
            <p className={styles.body}>They go in your site&rsquo;s header code, on every page. Your pages stay as they are. Someone else runs your site? Copy the steps below and send them; the lines are safe to share.</p>
            <pre className={styles.code} tabIndex={0} aria-label="Lines to add to your site">{[site.snippet.meta, site.snippet.script].filter(Boolean).join("\n")}</pre>
            <div className={styles.actions}><StPill variant="soft" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</StPill>{copied ? <span role="status" className={styles.body}>Lines copied</span> : null}</div>
          </>}
        </div></StSurface>
        <StSection title={site.verifiedAt ? "The site is connected" : "Publish, then check"}>
          <StSteps label="Connecting your site" steps={[
            { title: "Connection lines ready", state: "done" },
            { title: "Publish them on your site", state: site.verifiedAt ? "done" : "pending", detail: "Your website stays with its current provider." },
            { title: busy ? "Strelva is checking the live page" : site.verifiedAt ? "Strelva confirmed your site" : "Check the live page", state: busy ? "active" : site.verifiedAt ? "done" : "pending" },
          ]} />
          {site.verifiedAt ? <><p className={styles.body}>It&rsquo;s proven to be yours. Inquiries from it now arrive in Strelva, and visits show on its page.</p><div><StPillLink href={systemPage(site.systemId)}>Open your website</StPillLink></div></> : <><p className={styles.body}>Publish the site, then check. Strelva reads the live page to confirm it&rsquo;s yours. Nothing is collected until then.</p>{canManage ? <div><StPill busy={busy} disabled={unconfirmed} onClick={() => void verify()}>Check my site</StPill></div> : <StNotice>An owner or admin of this business checks the connection.</StNotice>}</>}
          <StState kind={site.verifiedAt ? "live" : "draft"}>{site.verifiedAt ? "Connected" : busy ? "Checking" : "Waiting for verification"}</StState>
        </StSection>
        <StSection title="What this connection does">
          <StRows label="Connection capabilities">
            <StRow title="Strelva can" detail="Fill in your confirmed business details, receive inquiries from the site and count visits after verification." />
            <StRow title="Strelva can’t" detail="Change your pages. They stay with your current provider." />
          </StRows>
        </StSection>
      </div>
      {!site.verifiedAt ? <StSection title="Where to paste them" meta={guide.label}>
          <SelectInput label="Your site is built with" value={shownPlatform} options={PLATFORM_OPTIONS} onChange={event => { setGuidePlatform(event.target.value as SitePlatform); setStepsCopied(false); }} />
          {guide.supported ? null : <StNotice>{guide.label} can&rsquo;t run these lines.</StNotice>}
          <StRows label={`Steps for ${guide.label}`}>{guide.steps.map((step, index) => <StRow key={step} lead={<StMono>{index + 1}</StMono>} title={step} stackOnPhone={false} />)}</StRows>
          {guide.requires ? <p className={styles.body}>{guide.requires}</p> : null}
          {guide.supported ? <div className={styles.actions}><StPill variant="soft" onClick={() => void copySteps()}>{stepsCopied ? "Steps copied" : "Copy steps for your web person"}</StPill>{stepsCopied ? <span role="status" className={styles.body}>Steps copied. Send them to whoever runs your site.</span> : null}</div> : null}
      </StSection> : null}
    </>}
    {error ? <StNotice tone="critical"><p ref={alert} tabIndex={-1}>{error}</p></StNotice> : null}
    {unconfirmed ? <div><StPill ref={reloadAction} variant="soft" disabled={busy} onClick={() => { if (!inFlight.current) window.location.reload(); }}>Reload connection</StPill></div> : null}
  </StPage></div>;
}
