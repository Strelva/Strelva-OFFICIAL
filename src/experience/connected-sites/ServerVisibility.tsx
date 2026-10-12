"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { exactBusinessPageUrl } from "@/products/connected-sites/client";
import { beginFocusRecovery, type FocusRecovery } from "@/experience/websites/focus-recovery";
import { StEmpty, StNotice, StPill, StSection, StState, StMono, StSurface, StTextButton, StPage } from "@/components/ui/strelva/Kit";
import styles from "./connected-sites.module.css";
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
const UNCONFIRMED_PAGE = "We couldn't confirm the public page's current state. Reload the page to check before trying again.";

const pageResponse = z.object({ page: z.object({ handle: z.string(), published: z.boolean(), url: z.string().url() }) });
const errorResponse = z.object({ error: z.string() });

/**
 * What AI assistants can read about the business without running
 * JavaScript (#309, #502): the public business page, and a static JSON-LD
 * block to paste into a site, with a check of the live page. Presentation
 * only; every call is rechecked on the server.
 */
export function ServerVisibility(props: { workspaceId: string; canManage: boolean; initial: VisibilityState; suggestedHandle?: string }) {
  return <ServerVisibilityContent key={props.workspaceId} {...props} />;
}
function ServerVisibilityContent({ workspaceId, canManage, initial, suggestedHandle = "" }: Parameters<typeof ServerVisibility>[0]) {
  const request = useWorkspaceRequest();
  const [page, setPage] = useState<VisibilityPage | null>(initial.page);
  const [handle, setHandle] = useState(initial.page?.handle ?? suggestedHandle);
  const [targetId, setTargetId] = useState(initial.blocks?.[0]?.id ?? "any");
  const [busy, setBusy] = useState<"page" | "check" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [check, setCheck] = useState<{ siteId: string; status: CheckStatus } | null>(null);
  const pageFlight = useRef(false);
  const pageNeedsReload = useRef(false);
  const [pageUnconfirmed, setPageUnconfirmed] = useState(false);
  const [pageError, setPageError] = useState("");
  const scope = useRef<HTMLDivElement>(null);
  const reloadAction = useRef<HTMLButtonElement>(null);
  const pageAlert = useRef<HTMLParagraphElement>(null);
  const recovery = useRef<FocusRecovery | null>(null);
  useEffect(() => () => recovery.current?.cancel(), []);
  useEffect(() => {
    if (busy !== "page" && recovery.current) {
      recovery.current.recover(pageUnconfirmed ? reloadAction.current : pageAlert.current, pageUnconfirmed);
      recovery.current = null;
    }
  }, [busy, pageUnconfirmed, pageError]);
  const target = initial.blocks?.find(item => item.id === targetId) ?? initial.blocks?.[0] ?? null;

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const response = await request("/api/workspace/connected-sites/visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
    const result = await response.json().catch(() => null) as Record<string, unknown> & { error?: string } | null;
    if (!response.ok || !result?.check) {
      setError(result?.error || "This check couldn't be completed. Try again.");
      return null;
    }
    return result;
  }
  function uncertainPage(message?: string) {
    pageNeedsReload.current = true; setPageUnconfirmed(true);
    setPageError([message, UNCONFIRMED_PAGE].filter(Boolean).join(" "));
  }
  async function savePage(event: { preventDefault(): void }, published: boolean) {
    event.preventDefault();
    if (!canManage || !initial.pagesEnabled || pageFlight.current || pageNeedsReload.current || busy !== null) return;
    const submittedHandle = handle.trim().toLowerCase();
    if (!submittedHandle) { setPageError("Choose the page's address first."); return; }
    pageFlight.current = true; recovery.current = beginFocusRecovery(scope.current);
    setBusy("page"); setPageError("");
    try {
      const response = await request("/api/workspace/connected-sites/visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, action: "page", handle: submittedHandle, published }) });
      const raw: unknown = await response.json().catch(() => null);
      const result = pageResponse.safeParse(raw), error = errorResponse.safeParse(raw);
      const message = error.success ? error.data.error : undefined;
      if (response.ok && result.success && result.data.page.handle === submittedHandle && result.data.page.published === published && exactBusinessPageUrl(result.data.page.url, submittedHandle)) {
        setPage(result.data.page);
      } else {
        const held = response.status === 503 && (message === "Connected sites are not enabled. Nothing changed." || message === "Public business pages are not enabled. Nothing changed.");
        // A generic400 can be a saved RPC row failing its response schema.
        // Only exact pre-write refusals permit a fresh mutation here.
        const refused = !response.ok && (held || [401, 403, 409, 429].includes(response.status) || (response.status === 400 && message === "Use 3 to 48 lowercase letters, numbers and single hyphens."));
        if (refused) setPageError(message || "That page change was refused.");
        else uncertainPage(message);
      }
    } catch { uncertainPage(); }
    finally { pageFlight.current = false; setBusy(null); }
  }
  async function runCheck() {
    if (!target?.checkable || pageFlight.current || busy !== null) return;
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

  return <div ref={scope}><StPage>
    <StSection title="Readable by assistants"><p className={styles.body}>Assistants may miss details a script adds. These put your confirmed details in the page itself. Only details you or Strelva confirmed are included.</p></StSection>

    {initial.pagesEnabled ? <StSection title="Your public business page" id="visibility-page">
      <p className={styles.body}>A plain page with your hours, contact details and services, plus a fact sheet for assistants. Strelva hosts it.</p>
      {page?.published ? <p className="text-sm">Live at <a className="break-all underline" href={page.url}>{page.url}</a> · <a className="underline" href={`${page.url}/llms.txt`}>fact sheet</a></p> : null}
      {canManage ? <StSurface label="Public business page"><form className={styles.stack} noValidate onSubmit={event => void savePage(event, true)} aria-label="Public business page">
        <TextInput label="Page address" helperText="3 to 48 lowercase letters, numbers and hyphens." value={handle} readOnly={busy !== null || pageUnconfirmed} spellCheck={false} autoCapitalize="none" maxLength={48}
          onChange={event => { if (!pageFlight.current && !pageNeedsReload.current) { setHandle(event.target.value); setPageError(""); } }} />
        <div className="flex flex-wrap gap-3">
          <StPill type="submit" busy={busy === "page"} disabled={busy !== null || pageUnconfirmed}>{page?.published ? "Save address" : "Make it live"}</StPill>
          {page?.published ? <StTextButton disabled={busy !== null || pageUnconfirmed} onClick={event => void savePage(event, false)}>Unpublish</StTextButton> : null}
        </div>
      </form></StSurface> : page?.published ? null : <p className={styles.body}>An owner or admin of this business publishes its page.</p>}
    </StSection> : null}

    <StSection title="Details block for your site" id="visibility-block">
      {!target ? <StEmpty>Confirm your business name in your details first. The block is built from confirmed details only.</StEmpty> : <>
        <p className={styles.body}>Paste this into your site&rsquo;s header code, on the home page at least. It works on any builder and without the Strelva script. When your details change, paste the new block; a check tells you when it&rsquo;s out of date.</p>
        {initial.blocks && initial.blocks.length > 1 ? <SelectInput label="For" value={target.id} disabled={busy !== null}
          options={initial.blocks.map(item => ({ value: item.id, label: item.label }))} onChange={event => { setTargetId(event.target.value); setCheck(null); setCopied(false); }} /> : null}
        <pre className={styles.code} aria-label="Details block to paste" tabIndex={0}>{target.block.html}</pre>
        <div className="flex flex-wrap items-center gap-3">
          <StPill type="button" variant="soft" onClick={() => void copy()}>{copied ? "Copied" : "Copy block"}</StPill>
          {target.checkable ? <StPill type="button" variant="soft" busy={busy === "check"} disabled={busy !== null && busy !== "check"} onClick={() => void runCheck()}>Check {target.label}</StPill> : null}
          <StMono>History reference {target.block.hash}</StMono>
        </div>
        {check && check.siteId === target.id ? <div role="status"><StState kind={check.status === "current" ? "live" : "need"}>{CHECK_MESSAGE[check.status]}</StState></div> : null}
      </>}
    </StSection>
    {pageError ? <StNotice tone="critical"><p ref={pageAlert} tabIndex={-1}>{pageError}</p></StNotice> : null}
    {pageUnconfirmed ? <div><StPill ref={reloadAction} variant="soft" disabled={busy === "page"} onClick={() => { if (!pageFlight.current) window.location.reload(); }}>Reload page</StPill></div> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </StPage></div>;
}
