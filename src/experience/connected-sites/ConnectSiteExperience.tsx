"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { expectedConnectedSiteSystemId } from "@/products/connected-sites/acknowledgement";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { PLATFORMS, type SitePlatform } from "@/products/connected-sites/contracts";
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
}

const PLATFORM_LABEL: Partial<Record<SitePlatform, string>> = {
  unknown: "I'm not sure", custom: "Custom or hand-written", wix: "Wix", squarespace: "Squarespace", wordpress: "WordPress", webflow: "Webflow",
  shopify: "Shopify", framer: "Framer", godaddy: "GoDaddy", "google-sites": "Google Sites", square: "Square", duda: "Duda", carrd: "Carrd",
};
const PLATFORM_OPTIONS = PLATFORMS.filter(value => PLATFORM_LABEL[value]).map(value => ({ value, label: PLATFORM_LABEL[value]! }));
const UNCONFIRMED_CONNECTION = "We couldn't confirm the connection's current state. Reload the page to check before trying again.";
const connectedResponse = z.object({ site: z.object({
  id: z.string().uuid(), siteHost: z.string().min(1), siteUrl: z.string().url(), status: z.enum(["active", "revoked"]),
  verifiedAt: z.string().nullable(), systemId: z.string().uuid(), snippet: z.object({ script: z.string(), meta: z.string().nullable() }),
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
export function ConnectSiteExperience(props: { workspaceId: string; canManage: boolean; initialSites: ConnectableSite[]; appBase?: string }) {
  return <ConnectSiteExperienceContent key={props.workspaceId} {...props} />;
}

function ConnectSiteExperienceContent({ workspaceId, canManage, initialSites, appBase = "" }: Parameters<typeof ConnectSiteExperience>[0]) {
  const request = useWorkspaceRequest();
  const [site, setSite] = useState<ConnectableSite | null>(() => initialSites.find(item => item.status === "active") ?? null);
  const [sites, setSites] = useState(initialSites.filter(item => item.status === "active"));
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<SitePlatform>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  return <div ref={scope} className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10 md:px-8">
    <header className="grid gap-2">
      <h1 className="font-display text-[32px] leading-10">Bring the website you already have</h1>
      <p className="text-sm text-gray-muted">Keep your site where it is: Wix, Squarespace, WordPress or anything else. Strelva fills in your confirmed details, takes its inquiries and counts visits. It never edits your pages.</p>
    </header>
    {sites.length ? <div className="grid gap-3">
      <SelectInput label="Connected website" value={site?.id ?? ""} options={[{ value: "", label: "Connect another website" }, ...sites.map(item => ({ value: item.id, label: item.siteHost }))]} onChange={event => { if (!inFlight.current && !needsReload.current) { setSite(sites.find(item => item.id === event.target.value) ?? null); setError(""); } }} disabled={busy || unconfirmed} />
      {site && canManage ? <Button type="button" variant="ghost" className="justify-self-start" disabled={busy || unconfirmed} onClick={() => { if (!inFlight.current && !needsReload.current) { setSite(null); setError(""); } }}>Connect another website</Button> : null}
    </div> : null}
    {!site ? canManage ? <form className="grid gap-4" onSubmit={connect} noValidate aria-label="Connect your website">
      <TextInput label="Your site's address" type="url" inputMode="url" autoComplete="url" placeholder="yourbusiness.com" value={url} readOnly={busy || unconfirmed} spellCheck={false} autoCapitalize="none" onChange={event => { if (!inFlight.current && !needsReload.current) { setUrl(event.target.value); setError(""); } }} />
      <SelectInput label="Built with" value={platform} options={PLATFORM_OPTIONS} disabled={busy || unconfirmed} onChange={event => { if (!inFlight.current && !needsReload.current) setPlatform(event.target.value as SitePlatform); }} />
      <Button type="submit" loading={busy} disabled={unconfirmed} className="justify-self-start">Get my two lines</Button>
    </form> : <p className="text-sm text-gray-muted">An owner or admin of this business connects its website.</p>
    : site.verifiedAt ? <section className="grid gap-3" aria-labelledby="connected-done">
      <h2 ref={resultHeading} tabIndex={-1} id="connected-done" className="text-base font-medium">{site.siteHost} is connected</h2>
      <p className="text-sm text-gray-muted">It&rsquo;s proven to be yours. Inquiries from it now arrive in Strelva, and visits show on its page.</p>
      <a className="justify-self-start text-sm underline" href={systemPage(site.systemId)}>Open your website</a>
    </section>
    : <section className="grid gap-3" aria-labelledby="connected-install">
      <h2 ref={resultHeading} tabIndex={-1} id="connected-install" className="text-base font-medium">Add these two lines to {site.siteHost}</h2>
      <p className="text-sm text-gray-muted">Paste them into your site&rsquo;s header code (most builders call it &ldquo;custom code&rdquo;), on every page. Someone else runs your site? Send them these lines; they&rsquo;re safe to share.</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-bg p-3 text-xs" aria-label="Lines to add to your site">{[site.snippet.meta, site.snippet.script].filter(Boolean).join("\n")}</pre>
      <p className="text-sm text-gray-muted">Publish the site, then check. Strelva reads the live page to confirm it&rsquo;s yours. Nothing is collected until then.</p>
      {canManage ? <Button type="button" loading={busy} disabled={unconfirmed} className="justify-self-start" onClick={() => void verify()}>Check my site</Button> : null}
    </section>}
    {error ? <p ref={alert} tabIndex={-1} role="alert" className="text-sm text-terra">{error}</p> : null}
    {unconfirmed ? <Button ref={reloadAction} type="button" variant="secondary" disabled={busy} className="justify-self-start" onClick={() => { if (!inFlight.current) window.location.reload(); }}>Reload connection</Button> : null}
  </div>;
}
