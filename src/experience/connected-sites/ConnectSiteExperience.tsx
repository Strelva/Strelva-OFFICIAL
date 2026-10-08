"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { PLATFORMS, type SitePlatform } from "@/products/connected-sites/contracts";
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

/**
 * A new business brings the website it already has (website System spec,
 * decision 3 working default). Address → two lines to paste → Strelva reads
 * the live page to confirm the site is theirs → the website opens as a
 * System. Strelva never edits the pages. Every call is rechecked on the server.
 */
export function ConnectSiteExperience({ workspaceId, canManage, initialSites, appBase = "" }: { workspaceId: string; canManage: boolean; initialSites: ConnectableSite[]; appBase?: string }) {
  const request = useWorkspaceRequest();
  const [site, setSite] = useState<ConnectableSite | null>(() => initialSites.find(item => item.status === "active") ?? null);
  const [sites, setSites] = useState(initialSites.filter(item => item.status === "active"));
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<SitePlatform>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const systemPage = (systemId: string) => `${appBase}/workspace?${new URLSearchParams({ view: "system", system: systemId, workspaceId })}`;

  async function post(body: Record<string, unknown>): Promise<ConnectableSite | null> {
    const response = await request("/api/workspace/connected-sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
    const result = await response.json().catch(() => null) as { site?: ConnectableSite; error?: string } | null;
    if (!response.ok || !result?.site) { setError(result?.error || "That didn't go through. Nothing changed."); return null; }
    setSites(items => [...items.filter(item => item.id !== result.site!.id), result.site!]);
    return result.site;
  }
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    if (!url.trim()) { setError("Enter your site's address, like yourbusiness.com."); return; }
    setBusy(true); setError("");
    try { const next = await post({ action: "connect", siteUrl: url.trim(), platform }); if (next) setSite(next); }
    catch { setError("We couldn't reach Strelva just now. Nothing changed."); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (!site || !canManage || busy) return;
    setBusy(true); setError("");
    try { const next = await post({ action: "verify", siteId: site.id }); if (next) setSite(next); }
    catch { setError("We couldn't reach Strelva just now. Nothing changed."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10 md:px-8">
    <header className="grid gap-2">
      <h1 className="font-display text-[32px] leading-10">Bring the website you already have</h1>
      <p className="text-sm text-gray-muted">Keep your site where it is: Wix, Squarespace, WordPress or anything else. Strelva fills in your confirmed details, takes its inquiries and counts visits. It never edits your pages.</p>
    </header>
    {sites.length ? <div className="grid gap-3">
      <SelectInput label="Connected website" value={site?.id ?? ""} options={[{ value: "", label: "Connect another website" }, ...sites.map(item => ({ value: item.id, label: item.siteHost }))]} onChange={event => { setSite(sites.find(item => item.id === event.target.value) ?? null); setError(""); }} disabled={busy} />
      {site && canManage ? <Button type="button" variant="ghost" className="justify-self-start" disabled={busy} onClick={() => { setSite(null); setError(""); }}>Connect another website</Button> : null}
    </div> : null}
    {!site ? canManage ? <form className="grid gap-4" onSubmit={connect} noValidate aria-label="Connect your website">
      <TextInput label="Your site's address" type="url" inputMode="url" autoComplete="url" placeholder="yourbusiness.com" value={url} disabled={busy} spellCheck={false} autoCapitalize="none" onChange={event => { setUrl(event.target.value); setError(""); }} />
      <SelectInput label="Built with" value={platform} options={PLATFORM_OPTIONS} disabled={busy} onChange={event => setPlatform(event.target.value as SitePlatform)} />
      <Button type="submit" loading={busy} className="justify-self-start">Get my two lines</Button>
    </form> : <p className="text-sm text-gray-muted">An owner or admin of this business connects its website.</p>
    : site.verifiedAt ? <section className="grid gap-3" aria-labelledby="connected-done">
      <h2 id="connected-done" className="text-base font-medium">{site.siteHost} is connected</h2>
      <p className="text-sm text-gray-muted">It&rsquo;s proven to be yours. Inquiries from it now arrive in Strelva, and visits show on its page.</p>
      <a className="justify-self-start text-sm underline" href={systemPage(site.systemId)}>Open your website</a>
    </section>
    : <section className="grid gap-3" aria-labelledby="connected-install">
      <h2 id="connected-install" className="text-base font-medium">Add these two lines to {site.siteHost}</h2>
      <p className="text-sm text-gray-muted">Paste them into your site&rsquo;s header code (most builders call it &ldquo;custom code&rdquo;), on every page. Someone else runs your site? Send them these lines; they&rsquo;re safe to share.</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-bg p-3 text-xs" aria-label="Lines to add to your site">{[site.snippet.meta, site.snippet.script].filter(Boolean).join("\n")}</pre>
      <p className="text-sm text-gray-muted">Publish the site, then check. Strelva reads the live page to confirm it&rsquo;s yours. Nothing is collected until then.</p>
      {canManage ? <Button type="button" loading={busy} className="justify-self-start" onClick={() => void verify()}>Check my site</Button> : null}
    </section>}
    {error ? <p role="alert" className="text-sm text-terra">{error}</p> : null}
  </div>;
}
