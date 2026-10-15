"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { StMono, StNotice, StPill, StSection, StState, StTable, StTextButton } from "@/components/ui/strelva/Kit";
import { SelectInput } from "@/components/ui/TextInput";
import {
  CLIENT_BULK_LIMIT, DETECTION_STALE_MS, agencyClientSitesPageSchema, clientAddress, clientBuiltWith, clientSiteHealth, installGuide,
  type AgencyClientSiteRow, type AgencyClientSitesView,
} from "@/products/connected-sites/client";
import type { SitePlatform } from "@/products/connected-sites/contracts";
import styles from "./connected-sites.module.css";

const ENDPOINT = "/api/workspace/agency-client-sites";
const MAX_PAGES = 10;
const pageBody = agencyClientSitesPageSchema.extend({ clients: z.array(agencyClientSitesPageSchema.shape.clients.element.extend({ enabled: z.boolean(), health: z.unknown().nullable() })) });
const resultsBody = z.object({ results: z.array(z.object({ workspaceId: z.string().uuid(), status: z.enum(["ok", "failed", "skipped"]), message: z.string().optional() })) });
const connectBody = z.object({ site: z.object({ snippet: z.object({ script: z.string(), meta: z.string().nullable() }) }), stepsText: z.string() });
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const hostOf = (address: string | null) => { try { return address ? new URL(address).hostname.replace(/^www\./, "") : null; } catch { return address; } };
const label = (platform: string) => installGuide(platform as SitePlatform).label;

type Load = { status: "loading" } | { status: "hidden" } | { status: "error"; message: string } | { status: "ready"; view: AgencyClientSitesView; more: boolean };
interface Lines { text: string; steps: string; platform: string }

/**
 * Clients → Client websites. Every staffed client's website, what it is built
 * with (read from the live page), and whether the Strelva lines are installed.
 * An agency gets the lines and per-platform steps, and checks installs, in bulk.
 * Nothing on a client's site changes and nothing is emailed.
 */
export function AgencyClientSites({ agencyWorkspaceId, request }: { agencyWorkspaceId: string; request: typeof fetch }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "status" | "alert"; text: string; failures?: string[] } | null>(null);
  const [lines, setLines] = useState<Record<string, Lines>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const inFlight = useRef(false);
  const loaded = useRef(0);

  const fetchPage = useCallback(async (cursor: { name: string; id: string } | null): Promise<AgencyClientSitesView | null> => {
    const query = new URLSearchParams({ agencyWorkspaceId, ...(cursor ? { afterName: cursor.name, afterId: cursor.id } : {}) });
    const response = await request(`${ENDPOINT}?${query}`);
    if (response.status === 404) return null;
    const parsed = pageBody.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success) throw new Error("The client websites could not be loaded.");
    return { clients: parsed.data.clients.map(row => ({ ...row, health: row.site ? clientSiteHealth(row.site) : null })), nextCursor: parsed.data.nextCursor };
  }, [agencyWorkspaceId, request]);

  /** Read the first page again, then as many more as were already showing. */
  const reload = useCallback(async () => {
    try {
      const first = await fetchPage(null);
      if (!first) { setLoad({ status: "hidden" }); return; }
      let view = first;
      for (let pages = 1; pages < MAX_PAGES && view.nextCursor && view.clients.length < loaded.current; pages += 1) {
        const next = await fetchPage(view.nextCursor);
        if (!next) break;
        view = { clients: [...view.clients, ...next.clients], nextCursor: next.nextCursor };
      }
      loaded.current = view.clients.length;
      setLoad({ status: "ready", view, more: false });
    } catch (error) {
      setLoad({ status: "error", message: error instanceof Error ? error.message : "The client websites could not be loaded." });
    }
  }, [fetchPage]);
  useEffect(() => { void reload(); }, [reload]);

  if (load.status === "hidden") return null;
  if (load.status === "loading") return <StSection title="Client websites"><p className={styles.body} role="status">Loading your clients’ websites…</p></StSection>;
  if (load.status === "error") return <StSection title="Client websites"><StNotice tone="critical">{load.message} Nothing on any site changed. <StTextButton onClick={() => { setLoad({ status: "loading" }); void reload(); }}>Try again</StTextButton></StNotice></StSection>;

  const { view } = load;
  const rows = view.clients;
  const nameOf = (workspaceId: string) => rows.find(row => row.workspaceId === workspaceId)?.name ?? "this client";
  const platformsPresent = [...new Set(rows.flatMap(row => { const built = clientBuiltWith(row); return built.platform ? [built.platform] : []; }))].sort();
  const shown = filter === "all" ? rows : rows.filter(row => clientBuiltWith(row).platform === filter);
  const stale = (row: AgencyClientSiteRow) => !row.detection || Date.now() - Date.parse(row.detection.detectedAt) > DETECTION_STALE_MS;
  const toDetect = shown.filter(row => row.enabled && clientAddress(row) && stale(row)).slice(0, CLIENT_BULK_LIMIT);
  const toCheck = shown.filter(row => row.enabled && row.site).slice(0, CLIENT_BULK_LIMIT);
  const stepsInFilter = filter === "all" ? [] : shown.flatMap(row => lines[row.workspaceId] ? [lines[row.workspaceId]!] : []);

  async function run(key: string, body: Record<string, unknown>, done: (raw: unknown) => boolean | void): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(key); setNotice(null);
    try {
      const response = await request(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agencyWorkspaceId, ...body }) });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(raw);
        setNotice({ tone: "alert", text: message.success ? message.data.error : "That could not be confirmed. Nothing on any site changed. Reload before trying again." });
        return;
      }
      if (done(raw) !== false) await reload();
    } catch {
      setNotice({ tone: "alert", text: "We couldn’t reach Strelva just now. Nothing on any site changed." });
    } finally {
      inFlight.current = false; setBusy(null);
    }
  }

  /** A bulk result is only ever "done" when every client was. Failures are named. */
  function summarize(verb: string, raw: unknown) {
    const parsed = resultsBody.safeParse(raw);
    if (!parsed.success) { setNotice({ tone: "alert", text: "That could not be confirmed. Reload before trying again." }); return false; }
    const failed = parsed.data.results.filter(item => item.status !== "ok");
    const ok = parsed.data.results.length - failed.length;
    setNotice(failed.length
      ? { tone: "alert", text: `${verb} ${ok} of ${parsed.data.results.length}. ${failed.length} did not go through:`, failures: failed.map(item => `${nameOf(item.workspaceId)}: ${item.message ?? "Couldn’t be done."}`) }
      : { tone: "status", text: `${verb} ${ok} ${ok === 1 ? "site" : "sites"}.` });
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); }
    catch { setNotice({ tone: "alert", text: "Copy is unavailable. Select the steps and copy them manually." }); }
  }

  const cellActions = (row: AgencyClientSiteRow) => {
    if (!row.enabled) return <small className={styles.body}>Keep your site isn&rsquo;t on for {row.name}.</small>;
    const address = clientAddress(row);
    const got = lines[row.workspaceId];
    return <span className={styles.stack}>
      {row.site && row.health ? <StState kind={row.health.tone}>{row.health.label}</StState> : <span>Not added</span>}
      {!row.site && address && !got ? <StTextButton disabled={busy !== null} onClick={() => void run(`connect:${row.workspaceId}`, { action: "connect", workspaceId: row.workspaceId }, raw => {
        const parsed = connectBody.safeParse(raw);
        if (!parsed.success) { setNotice({ tone: "alert", text: "That could not be confirmed. Reload before trying again." }); return false; }
        const built = clientBuiltWith(row).platform ?? "unknown";
        setLines(current => ({ ...current, [row.workspaceId]: { text: [parsed.data.site.snippet.meta, parsed.data.site.snippet.script].filter(Boolean).join("\n"), steps: parsed.data.stepsText, platform: built } }));
      })}>Get the two lines</StTextButton> : null}
      {row.site && !row.site.verifiedAt ? <StTextButton disabled={busy !== null} onClick={() => void run(`check:${row.workspaceId}`, { action: "check", workspaceIds: [row.workspaceId] }, raw => { summarize("Checked", raw); })}>Check the lines</StTextButton> : null}
      {got ? <span className={styles.stack}>
        <pre className={styles.code} tabIndex={0} aria-label={`Lines for ${row.name}`}>{got.text}</pre>
        <StPill variant="soft" onClick={() => void copy(got.steps, row.workspaceId)}>{copied === row.workspaceId ? "Steps copied" : `Copy steps for ${label(got.platform)}`}</StPill>
      </span> : null}
    </span>;
  };

  return <StSection title="Client websites" meta={<StMono>{rows.length}</StMono>} id="client-websites">
    <p className={styles.body}>Sites your clients already run elsewhere. Strelva reads each live page to see what it&rsquo;s built with. Nothing on the sites changes.</p>
    <div className={styles.actions}>
      <StPill variant="soft" busy={busy === "detect"} disabled={busy !== null || !toDetect.length} onClick={() => void run("detect", { action: "detect", workspaceIds: toDetect.map(row => row.workspaceId) }, raw => { summarize("Read", raw); })}>Check what they&rsquo;re built with</StPill>
      <StPill variant="soft" busy={busy === "check"} disabled={busy !== null || !toCheck.length} onClick={() => void run("check", { action: "check", workspaceIds: toCheck.map(row => row.workspaceId) }, raw => { summarize("Checked", raw); })}>Check all lines</StPill>
      {filter !== "all" && stepsInFilter.length ? <StPill variant="soft" onClick={() => void copy(stepsInFilter.map(item => item.steps).join("\n\n---\n\n"), "all")}>{copied === "all" ? "Steps copied" : `Copy steps for all ${label(filter)} sites`}</StPill> : null}
    </div>
    {platformsPresent.length ? <SelectInput label="Built with" value={filter} options={[{ value: "all", label: "All" }, ...platformsPresent.map(value => ({ value, label: label(value) }))]} onChange={event => setFilter(event.target.value)} /> : null}
    {notice ? <StNotice tone={notice.tone === "alert" ? "critical" : undefined}><span role={notice.tone}>{notice.text}</span>{notice.failures?.length ? <ul>{notice.failures.map(item => <li key={item}>{item}</li>)}</ul> : null}</StNotice> : null}
    {rows.length ? <StTable label="Client websites" columns={[
      { key: "client", label: "Client" }, { key: "website", label: "Website" }, { key: "built", label: "Built with" }, { key: "lines", label: "Strelva lines" }, { key: "visit", label: "Last visit" },
    ]} rows={shown.map(row => {
      const built = clientBuiltWith(row);
      const address = clientAddress(row);
      return {
        key: row.workspaceId, label: row.name,
        cells: {
          client: row.name,
          website: hostOf(address) ?? "No website on record",
          built: built.platform
            ? <span className={styles.stack}><span>{label(built.platform)}</span>{!installGuide(built.platform as SitePlatform).supported ? <small>{label(built.platform)} can&rsquo;t run these lines.</small> : null}</span>
            : built.state === "unreachable" ? "Couldn’t open the site" : built.state === "not_recognized" ? "Not recognized" : "Not checked yet",
          lines: cellActions(row),
          visit: row.site ? day(row.site.lastEventAt) : "—",
        },
      };
    })} /> : <p className={styles.body}>No client has a website on record yet.</p>}
    {view.nextCursor ? <div><StPill variant="soft" busy={busy === "more"} disabled={busy !== null} onClick={async () => {
      if (inFlight.current || !view.nextCursor) return;
      inFlight.current = true; setBusy("more");
      try {
        const next = await fetchPage(view.nextCursor);
        if (next) { loaded.current = rows.length + next.clients.length; setLoad({ status: "ready", view: { clients: [...rows, ...next.clients], nextCursor: next.nextCursor }, more: false }); }
      } catch { setNotice({ tone: "alert", text: "More clients could not be loaded. Nothing changed." }); }
      finally { inFlight.current = false; setBusy(null); }
    }}>Show more clients</StPill></div> : null}
  </StSection>;
}
