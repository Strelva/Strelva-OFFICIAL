"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

export interface VisibilityPage { handle: string; published: boolean; url: string }
export interface VisibilityBlock { id: string; label: string; url: string | null; checkable: boolean; block: { hash: string; html: string } }
export interface VisibilityState { pagesEnabled: boolean; page: VisibilityPage | null; blocks: VisibilityBlock[] | null }

type CheckStatus = "missing" | "current" | "outdated" | "edited";
const CHECK_MESSAGE: Record<CheckStatus, string> = {
  current: "The block on the live page matches the confirmed details.",
  outdated: "The live page has an older block. Your details changed since it was pasted. Replace it with the one above.",
  edited: "The block on the live page was changed by hand. Replace it with the one above.",
  missing: "No Strelva block on the live page yet. Paste the one above, publish the site, then check again.",
};

/**
 * What AI assistants can read about the business without running
 * JavaScript (#309, #502): the public business page, and a static JSON-LD
 * block to paste into a site, with a check of the live page. Presentation
 * only; every call is rechecked on the server.
 */
export function ServerVisibility({ workspaceId, canManage, initial, suggestedHandle = "" }: { workspaceId: string; canManage: boolean; initial: VisibilityState; suggestedHandle?: string }) {
  const request = useWorkspaceRequest();
  const [page, setPage] = useState<VisibilityPage | null>(initial.page);
  const [handle, setHandle] = useState(initial.page?.handle ?? suggestedHandle);
  const [targetId, setTargetId] = useState(initial.blocks?.[0]?.id ?? "any");
  const [busy, setBusy] = useState<"page" | "check" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [check, setCheck] = useState<{ siteId: string; status: CheckStatus } | null>(null);
  const target = initial.blocks?.find(item => item.id === targetId) ?? initial.blocks?.[0] ?? null;

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const response = await request("/api/workspace/connected-sites/visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
    const result = await response.json().catch(() => null) as Record<string, unknown> & { error?: string } | null;
    if (!response.ok || !result) { setError(result?.error || "That didn't go through. Nothing changed."); return null; }
    return result;
  }
  async function savePage(event: { preventDefault(): void }, published: boolean) {
    event.preventDefault();
    if (!handle.trim()) { setError("Choose the page's address first."); return; }
    setBusy("page"); setError("");
    try { const result = await post({ action: "page", handle: handle.trim().toLowerCase(), published }); if (result?.page) setPage(result.page as VisibilityPage); }
    catch { setError("We couldn't reach Strelva just now. Nothing changed."); }
    finally { setBusy(null); }
  }
  async function runCheck() {
    if (!target?.checkable) return;
    setBusy("check"); setError(""); setCheck(null);
    try { const result = await post({ action: "check", siteId: target.id }); if (result?.check) setCheck(result.check as { siteId: string; status: CheckStatus }); }
    catch { setError("We couldn't reach Strelva just now."); }
    finally { setBusy(null); }
  }
  async function copy() {
    if (!target) return;
    try { await navigator.clipboard.writeText(target.block.html); setCopied(true); }
    catch { setError("Copy is unavailable. Select the block and copy it manually."); }
  }

  return <div className="mx-auto grid w-full max-w-2xl gap-8 px-4 pb-12 md:px-8">
    <header className="grid gap-2 border-t border-gray-border pt-8">
      <h2 className="text-lg font-medium">Readable by AI assistants</h2>
      <p className="text-sm text-gray-muted">Most AI assistants don&rsquo;t run JavaScript, so they miss details a script adds. These put your confirmed details in the page itself. Only details you or Strelva confirmed are included.</p>
    </header>

    {initial.pagesEnabled ? <section className="grid gap-3" aria-labelledby="visibility-page">
      <h3 id="visibility-page" className="text-base font-medium">Your public business page</h3>
      <p className="text-sm text-gray-muted">A plain page with your hours, contact details and services, plus a fact sheet for assistants. Strelva hosts it.</p>
      {page?.published ? <p className="text-sm">Live at <a className="break-all underline" href={page.url}>{page.url}</a> · <a className="underline" href={`${page.url}/llms.txt`}>fact sheet</a></p> : null}
      {canManage ? <form className="grid gap-3" noValidate onSubmit={event => void savePage(event, true)} aria-label="Public business page">
        <TextInput label="Page address" helperText="3 to 48 lowercase letters, numbers and hyphens." value={handle} disabled={busy !== null} spellCheck={false} autoCapitalize="none" maxLength={48}
          onChange={event => { setHandle(event.target.value); setError(""); }} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy === "page"}>{page?.published ? "Save address" : "Publish page"}</Button>
          {page?.published ? <Button type="button" variant="secondary" disabled={busy !== null} onClick={event => void savePage(event, false)}>Unpublish</Button> : null}
        </div>
      </form> : page?.published ? null : <p className="text-sm text-gray-muted">An owner or admin of this business publishes its page.</p>}
    </section> : null}

    <section className="grid gap-3" aria-labelledby="visibility-block">
      <h3 id="visibility-block" className="text-base font-medium">Details block for your site</h3>
      {!target ? <p className="text-sm text-gray-muted">Confirm your business name in your details first. The block is built from confirmed details only.</p> : <>
        <p className="text-sm text-gray-muted">Paste this into your site&rsquo;s header code, on the home page at least. It works on any builder and without the Strelva script. When your details change, paste the new block; a check tells you when it&rsquo;s out of date.</p>
        {initial.blocks && initial.blocks.length > 1 ? <SelectInput label="For" value={target.id} disabled={busy !== null}
          options={initial.blocks.map(item => ({ value: item.id, label: item.label }))} onChange={event => { setTargetId(event.target.value); setCheck(null); setCopied(false); }} /> : null}
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-bg p-3 text-xs" aria-label="Details block to paste" tabIndex={0}>{target.block.html}</pre>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => void copy()}>{copied ? "Copied" : "Copy block"}</Button>
          {target.checkable ? <Button type="button" variant="secondary" loading={busy === "check"} disabled={busy !== null && busy !== "check"} onClick={() => void runCheck()}>Check {target.label}</Button> : null}
          <span className="text-xs text-gray-muted">Version {target.block.hash}</span>
        </div>
        {check && check.siteId === target.id ? <p role="status" className="text-sm">{CHECK_MESSAGE[check.status]}</p> : null}
      </>}
    </section>
    {error ? <p role="alert" className="text-sm text-terra">{error}</p> : null}
  </div>;
}
