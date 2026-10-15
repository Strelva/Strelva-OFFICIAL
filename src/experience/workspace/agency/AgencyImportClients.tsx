"use client";

import { Check, Copy, Download } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { StCopy, StField, StHead, StMono, StNotice, StPage, StPill, StSection, StSegmented, StTable, StTextButton } from "@/components/ui/strelva/Kit";
import {
  CLIENT_IMPORT_APPLY_BATCH,
  type ClientImportApplyResult,
  type ClientImportPreview,
  type ClientImportPreviewRow,
  type ClientImportOwnerCandidate,
  type ClientImportRow,
  type ClientImportRowState,
  type ClientImportSource,
} from "@/products/agency-clients/contracts";
import {
  CLIENT_SHEET_FIELD_LABELS,
  CLIENT_SHEET_FIELDS,
  CLIENT_SHEET_MAX_BYTES,
  clientRowsFromSheet,
  detectClientSheetColumns,
  parseClientSheet,
  type ClientSheetField,
  type ClientSheetMapping,
  type ParsedClientSheet,
} from "@/products/agency-clients/index";

/**
 * Import clients (GLOSSARY: Import clients). The agency pastes or uploads its
 * list, checks the columns, reviews every row in one preview (nothing is
 * added yet), then adds the rows it keeps. Each row is added exactly like
 * Add a client. Strelva emails no one (decision R08): the agency copies or
 * downloads the owner links and sends them itself.
 */

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function post<T>(body: unknown, fallback: string): Promise<T> {
  const response = await fetch("/api/workspace/agency-clients/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new RequestError(response.status, typeof json.error === "string" ? json.error : fallback);
  return json as T;
}

const STATE_LABELS: Record<ClientImportRowState, string> = {
  ready: "Ready",
  duplicate: "Duplicate",
  incomplete: "Needs a website or name",
  added: "Added",
  refused: "Not added",
};

function absolute(path: string) {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

type Step = "source" | "columns" | "preview" | "adding" | "done";
type Mode = "paste" | "file" | "highlevel";

const BASIS_LABELS: Record<ClientImportOwnerCandidate["basis"], string> = {
  account_admin: "Sub-account admin",
  account_user: "Team member",
  business_email: "Business email",
};
const BASIS_ORDER: ClientImportOwnerCandidate["basis"][] = ["account_admin", "account_user", "business_email"];
const OTHER = "__other";
const ownerEmailSchema = z.string().trim().toLowerCase().email().max(254);

/** The owner the agency chose for a row: a candidate, someone else, or nobody yet. */
interface OwnerChoice { choice: string; other: string }

/** The address an add would use for this row, or an error to show. */
function chosenOwner(row: ClientImportRow, owner: OwnerChoice | undefined): { email?: string; error?: string } {
  if (!row.ownerEmailCandidates?.length || !owner) return row.ownerEmail ? { email: row.ownerEmail } : {};
  if (owner.choice === OTHER) {
    const parsed = ownerEmailSchema.safeParse(owner.other);
    return parsed.success ? { email: parsed.data } : { error: "Enter the owner’s email, or choose one of the addresses." };
  }
  return owner.choice ? { email: owner.choice } : {};
}

/** What apply sends: the chosen owner address, never the candidates (the add input is strict). */
function rowToAdd(row: ClientImportRow, owner: OwnerChoice | undefined): ClientImportRow {
  const { ownerEmailCandidates: _candidates, ownerEmail: _email, ...rest } = row;
  const email = chosenOwner(row, owner).email;
  return { ...rest, ...(email ? { ownerEmail: email } : {}) };
}

interface HighLevelConnection { status: "connected" | "needs_reauth" | "revoked"; companyId?: string }
/** One row of the agency's list. `uid` is its place in this list; two rows may share a source ref. */
interface Item { uid: number; sheetRow: number; entry: ClientImportPreviewRow }

export function AgencyImportClients({ agencyWorkspaceId, highLevel = false, initialSource, initialNotice, initialError }: { agencyWorkspaceId: string; highLevel?: boolean; initialSource?: "highlevel"; initialNotice?: string; initialError?: string }) {
  const id = useId().replace(/:/g, "");
  const agencyHref = `/workspace?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`;
  const [step, setStep] = useState<Step>("source");
  const [mode, setMode] = useState<Mode>(initialSource === "highlevel" && highLevel ? "highlevel" : "paste");
  const [source, setSource] = useState<ClientImportSource>("sheet");
  const [owners, setOwners] = useState<Record<number, OwnerChoice>>({});
  const [connection, setConnection] = useState<HighLevelConnection | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<ParsedClientSheet | null>(null);
  const [mapping, setMapping] = useState<ClientSheetMapping>({});
  const [preview, setPreview] = useState<ClientImportPreview | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [setupReady, setSetupReady] = useState<boolean | undefined>(undefined);
  const [signedOut, setSignedOut] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [copied, setCopied] = useState("");

  function readList(value: string) {
    const parsed = parseClientSheet(value);
    if (!parsed.records.length) { setError(parsed.problems[0] ?? "There are no rows to import."); return; }
    setSheet(parsed); setMapping(detectClientSheetColumns(parsed)); setError(""); setStep("columns");
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > CLIENT_SHEET_MAX_BYTES) { setError("This file is larger than 1 MB. Split it and import each part."); return; }
    setFileName(file.name);
    const content = await file.text();
    setText(content);
    readList(content);
  }

  /** Preview rows from any source; `refused` rows the source itself could not use are shown beside them. */
  async function runPreview(from: ClientImportSource, rows: ClientImportRow[], rowNumbers: number[], refused: ClientImportPreviewRow[] = [], refusedRowNumbers: number[] = []) {
    setBusy(true); setError("");
    try {
      const result = rows.length
        ? await post<ClientImportPreview>({ action: "preview", agencyWorkspaceId, source: from, rows }, "Your list couldn’t be checked.")
        : null;
      // The preview answers row for row, in the order sent.
      const all: Item[] = [
        ...(result?.rows ?? []).map((entry, index) => ({ uid: index, sheetRow: rowNumbers[index] ?? 0, entry })),
        ...refused.map((entry, index) => ({ uid: rows.length + index, sheetRow: refusedRowNumbers[index] ?? 0, entry })),
      ].sort((left, right) => left.sheetRow - right.sheetRow);
      setSource(from);
      setPreview(result);
      setItems(all);
      // A source that names one owner preselects it; with only candidates, nothing is preselected.
      setOwners(Object.fromEntries(all.filter((item) => item.entry.row.ownerEmailCandidates?.length)
        .map((item) => [item.uid, { choice: item.entry.row.ownerEmail ?? "", other: "" }])));
      const room = result?.canAddToday ?? 0;
      setChosen(new Set(all.filter((item) => item.entry.state === "ready").slice(0, room).map((item) => item.uid)));
      setStep("preview");
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) { setSignedOut(true); return; }
      setError(cause instanceof Error ? cause.message : "Your list couldn’t be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!sheet) return;
    if (mapping.url === undefined && mapping.name === undefined) { setError("Choose the column with each client’s website or business name."); return; }
    const read = clientRowsFromSheet(sheet, mapping);
    await runPreview("sheet", read.rows, read.rowNumbers, read.refused, read.refusedRowNumbers);
  }

  // HighLevel (L6): read the agency's connection when that source is chosen.
  useEffect(() => {
    if (mode !== "highlevel" || connection !== undefined) return;
    const controller = new AbortController();
    fetch(`/api/workspace/agency-clients/gohighlevel?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { connection?: HighLevelConnection | null; setup?: { ready?: boolean }; error?: string };
        if (response.status === 401) { setSignedOut(true); return; }
        if (typeof body.setup?.ready === "boolean") setSetupReady(body.setup.ready);
        if (!response.ok) { setConnection(null); setError(body.error ?? "Your HighLevel connection couldn’t be read."); return; }
        setConnection(body.connection ?? null);
      })
      .catch(() => { if (!controller.signal.aborted) { setConnection(null); setError("Your HighLevel connection couldn’t be read."); } });
    return () => controller.abort();
  }, [mode, connection, agencyWorkspaceId]);

  async function readHighLevel() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/workspace/agency-clients/gohighlevel?workspaceId=${encodeURIComponent(agencyWorkspaceId)}&rows=1`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { rows?: ClientImportRow[]; error?: string; code?: string };
      if (response.status === 401) { setSignedOut(true); return; }
      if (!response.ok) {
        if (body.code === "ghl_not_connected" || body.code === "ghl_revoked") setConnection(null);
        setError(body.error ?? "Your HighLevel sub-accounts couldn’t be read.");
        return;
      }
      const rows = body.rows ?? [];
      if (!rows.length) { setError("Your HighLevel agency has no sub-accounts to import."); return; }
      setBusy(false);
      await runPreview("gohighlevel", rows.slice(0, 500), rows.slice(0, 500).map((_, index) => index + 1));
    } catch {
      setError("Your HighLevel sub-accounts couldn’t be read.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const queue = items.filter((item) => item.entry.state === "ready" && chosen.has(item.uid));
    if (!queue.length) return;
    const unclear = queue.find((item) => chosenOwner(item.entry.row, owners[item.uid]).error);
    if (unclear) { setError(`Row ${unclear.sheetRow}: enter the owner’s email, or choose one of the addresses.`); return; }
    setStep("adding"); setError(""); setProgress({ done: 0, total: queue.length });
    // The apply answers row for row, in the order sent.
    const update = (batch: Item[], results: ClientImportPreviewRow[]) => setItems((current) => current.map((item) => {
      const at = batch.findIndex((sent) => sent.uid === item.uid);
      return at >= 0 && results[at] ? { ...item, entry: results[at]! } : item;
    }));
    for (let index = 0; index < queue.length; index += CLIENT_IMPORT_APPLY_BATCH) {
      const batch = queue.slice(index, index + CLIENT_IMPORT_APPLY_BATCH);
      try {
        const result = await post<ClientImportApplyResult>({ action: "apply", agencyWorkspaceId, source, rows: batch.map((item) => rowToAdd(item.entry.row, owners[item.uid])) }, "These rows couldn’t be added.");
        update(batch, result.rows);
      } catch (cause) {
        if (cause instanceof RequestError && cause.status === 401) { setSignedOut(true); return; }
        const reason = cause instanceof Error && cause.message ? cause.message : "These rows couldn’t be added.";
        // The outcome is unknown; importing the same list again replays instead of adding twice.
        update(batch, batch.map((item) => ({ ...item.entry, row: rowToAdd(item.entry.row, owners[item.uid]), state: "refused", reason: `${reason} Import the list again to finish; nothing is added twice.`.slice(0, 300) })));
      }
      setProgress({ done: Math.min(index + batch.length, queue.length), total: queue.length });
    }
    setStep("done");
  }

  const counts = useMemo(() => items.reduce<Record<ClientImportRowState, number>>((total, item) => ({ ...total, [item.entry.state]: total[item.entry.state] + 1 }),
    { ready: 0, duplicate: 0, incomplete: 0, added: 0, refused: 0 }), [items]);
  const links = items.map((item) => item.entry).filter((row) => row.state === "added" && row.ownerClaimPath);
  const chosenCount = items.filter((item) => item.entry.state === "ready" && chosen.has(item.uid)).length;
  const room = preview?.canAddToday ?? 0;

  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); } catch { setCopied(""); }
  }

  function download() {
    const lines = [["Business", "Website", "Owner email", "Claim link"], ...links.map((row) => [row.row.name ?? "", row.row.url ?? "", row.row.ownerEmail ?? "", absolute(row.ownerClaimPath!)])];
    const blob = new Blob([lines.map((line) => line.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "owner-claim-links.csv"; anchor.click();
    URL.revokeObjectURL(url);
  }

  if (signedOut) {
    return <Frame agencyHref={agencyHref}>
      <StNotice tone="critical" action={<StTextButton href={`/sign-in?next=${encodeURIComponent(`/workspace/agency/clients/import?workspaceId=${agencyWorkspaceId}`)}`}>Sign in</StTextButton>}>
        Sign in with the account you run your agency with. Rows already added stay added, and importing the list again never adds them twice.
      </StNotice>
    </Frame>;
  }

  return <Frame agencyHref={agencyHref}>
    {step === "source" ? <StSection title="Your list" meta={mode === "highlevel" ? "Your HighLevel sub-accounts" : "CSV, TSV, or rows copied from Google Sheets or Excel"}>
      <StCopy muted>One client per row. A website or a business name is enough; an owner’s email gets a claim link you send yourself. Phone and address are kept for the owner to confirm.</StCopy>
      <StSegmented label="How you’re bringing the list" value={mode} onChange={(value) => { setMode(value); setError(""); setNotice(""); }} options={[{ value: "paste", label: "Paste rows" }, { value: "file", label: "Upload a file" }, ...(highLevel ? [{ value: "highlevel" as const, label: "HighLevel" }] : [])]} />
      {mode === "highlevel" ? <HighLevelSource agencyWorkspaceId={agencyWorkspaceId} connection={connection} setupReady={setupReady} busy={busy} onRead={() => void readHighLevel()} />
        : mode === "paste"
        ? <StField label="Rows" hint="Include the header row if your sheet has one.">
          <textarea id={`${id}-paste`} rows={10} value={text} spellCheck={false} onChange={(event) => { setText(event.target.value); setError(""); }} placeholder={"Business\tWebsite\tOwner email\nNorthside Bakery\tnorthsidebakery.com\towner@northsidebakery.com"} />
        </StField>
        : <StField label="CSV or TSV file" hint={fileName ? `Read ${fileName}.` : "Up to 1 MB and 500 rows."}>
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={(event) => void onFile(event)} />
        </StField>}
      {notice && !error ? <StNotice>{notice}</StNotice> : null}
      {error ? <StNotice tone="critical">{error}</StNotice> : null}
      {mode === "paste" ? <div><StPill onClick={() => readList(text)} disabled={!text.trim()}>Read the list</StPill></div> : null}
    </StSection> : null}

    {step === "columns" && sheet ? <StSection title="Check the columns" meta={`${sheet.records.length} ${sheet.records.length === 1 ? "row" : "rows"}${sheet.hasHeader ? "" : " · no header row"}`}>
      <StCopy muted>We matched these from your headers. Change any that are wrong.</StCopy>
      {sheet.problems.map((problem) => <StNotice key={problem} tone="need">{problem}</StNotice>)}
      <div className="grid gap-4 sm:grid-cols-2">
        {CLIENT_SHEET_FIELDS.map((field) => <StField key={field} label={CLIENT_SHEET_FIELD_LABELS[field]}>
          <select value={mapping[field] ?? ""} onChange={(event) => setMapping((current) => columnChoice(current, field, event.target.value))}>
            <option value="">Not in this list</option>
            {sheet.headers.map((header, index) => <option key={index} value={index}>{header}{sheet.records[0]?.values[index] ? ` (${sheet.records[0].values[index]!.slice(0, 40)})` : ""}</option>)}
          </select>
        </StField>)}
      </div>
      {error ? <StNotice tone="critical">{error}</StNotice> : null}
      <div className="flex flex-wrap items-center gap-4">
        <StPill busy={busy} onClick={() => void check()}>Check rows</StPill>
        <StTextButton onClick={() => { setStep("source"); setError(""); }}>Use a different list</StTextButton>
      </div>
    </StSection> : null}

    {(step === "preview" || step === "adding" || step === "done") ? <StSection title={step === "done" ? "Import finished" : "Review before adding"} meta={<StMono>{summary(counts)}</StMono>}>
      {step === "preview" ? <>
        <StCopy muted>Nothing has been added yet. Each row you keep is added like Add a client: we read their site, run an AI check saved in your agency, and make the owner’s claim link. Strelva emails no one.</StCopy>
        {preview ? <StNotice tone={room < counts.ready ? "need" : undefined}>
          {room > 0 ? `You can add ${room} more ${room === 1 ? "client" : "clients"} now.` : "Your agency can’t add more clients right now."}{" "}
          Your limits: {preview.limits.daily} new clients a day ({preview.limits.usedToday} used today), and {preview.limits.waitingForOwner} waiting for their owner ({preview.limits.waiting} now).
          {room < counts.ready ? " Rows past the limit stay unchecked; import the list again later and only new rows are added." : ""}
        </StNotice> : null}
      </> : null}
      {step === "adding" ? <p role="status" className="text-[13px]"><StMono>Adding {progress.done} of {progress.total}</StMono> · Keep this page open. If it closes, import the list again; nothing is added twice.</p> : null}
      <StTable label="Rows in your list" columns={[
        { key: "row", label: "Row", mono: true },
        { key: "business", label: "Business" },
        { key: "owner", label: "Owner’s email" },
        { key: "state", label: "State" },
      ]} rows={items.map(({ uid, sheetRow, entry: row }) => ({
        key: String(uid),
        label: row.row.name ?? row.row.url ?? row.row.sourceRef,
        cells: {
          row: step === "preview" && row.state === "ready"
            ? <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" className="size-4" checked={chosen.has(uid)} onChange={(event) => setChosen((current) => { const next = new Set(current); if (event.target.checked) next.add(uid); else next.delete(uid); return next; })} aria-label={`Add ${row.row.name ?? row.row.url ?? "this row"}`} />{sheetRow}</label>
            : String(sheetRow),
          business: <><strong className="block font-medium">{row.row.name ?? (row.row.url ? "Name read from their site" : "No name")}</strong><small className="block break-all text-gray-muted">{row.row.url ?? "No website"}</small></>,
          owner: step === "preview" && row.state === "ready" && row.row.ownerEmailCandidates?.length
            ? <OwnerPicker candidates={row.row.ownerEmailCandidates} value={owners[uid] ?? { choice: row.row.ownerEmail ?? "", other: "" }}
              label={row.row.name ?? row.row.url ?? "this client"} onChange={(value) => setOwners((current) => ({ ...current, [uid]: value }))} />
            : (step === "preview" ? row.row.ownerEmail : chosenOwner(row.row, owners[uid]).email ?? row.row.ownerEmail) ?? <span className="text-gray-muted">None</span>,
          state: <><strong className="block font-medium">{STATE_LABELS[row.state]}</strong>{row.reason || row.note ? <small className="block text-gray-muted">{row.reason ?? row.note}</small> : null}</>,
        },
      }))} />
      {step === "preview" && error ? <StNotice tone="critical">{error}</StNotice> : null}
      {step === "preview" ? <div className="flex flex-wrap items-center gap-4">
        <StPill onClick={() => void add()} disabled={!chosenCount}>{chosenCount ? `Add ${chosenCount} ${chosenCount === 1 ? "client" : "clients"}` : "Choose rows to add"}</StPill>
        {source === "sheet" ? <StTextButton onClick={() => setStep("columns")}>Change columns</StTextButton> : <StTextButton onClick={() => setStep("source")}>Use a different source</StTextButton>}
      </div> : null}
    </StSection> : null}

    {step === "done" ? <StSection title="Owner claim links" meta={`${links.length} ${links.length === 1 ? "link" : "links"}`} action={links.length ? <span className="inline-flex flex-wrap gap-4">
      <StTextButton onClick={() => void copy(links.map((row) => `${row.row.name ?? row.row.url ?? ""}\t${row.row.ownerEmail ?? ""}\t${absolute(row.ownerClaimPath!)}`).join("\n"), "all")}>{copied === "all" ? <><Check size={14} aria-hidden="true" />Copied</> : <><Copy size={14} aria-hidden="true" />Copy all</>}</StTextButton>
      <StTextButton onClick={download}><Download size={14} aria-hidden="true" />Download CSV</StTextButton>
    </span> : undefined}>
      <StCopy muted>Strelva doesn’t email owners yet. Send each owner their link from your own email. Each link works for 14 days and only for the address it names. These links are shown once; you can make a new one from the client later.</StCopy>
      {links.length ? <ul className="divide-y divide-gray-border border-y border-gray-border">{links.map((row) => <li key={row.row.sourceRef} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <span className="min-w-0"><strong className="block text-[14px] font-medium">{row.row.name ?? row.row.url}</strong><small className="block text-[12px] text-gray-muted">{row.row.ownerEmail}</small></span>
        <StTextButton onClick={() => void copy(absolute(row.ownerClaimPath!), row.row.sourceRef)}>{copied === row.row.sourceRef ? <><Check size={14} aria-hidden="true" />Copied</> : <><Copy size={14} aria-hidden="true" />Copy link</>}</StTextButton>
      </li>)}</ul> : <StCopy muted>No owner links were made in this import. Add an owner’s email to a client to make one.</StCopy>}
      <div className="flex flex-wrap items-center gap-4"><StTextButton href={agencyHref}>Back to clients</StTextButton><StTextButton onClick={() => { setStep("source"); setItems([]); setOwners({}); setSource("sheet"); setPreview(null); setSheet(null); setText(""); setFileName(""); }}>Import another list</StTextButton></div>
    </StSection> : null}
  </Frame>;
}

function OwnerPicker({ candidates, value, label, onChange }: { candidates: ClientImportOwnerCandidate[]; value: OwnerChoice; label: string; onChange: (value: OwnerChoice) => void }) {
  const sorted = [...candidates].sort((left, right) => BASIS_ORDER.indexOf(left.basis) - BASIS_ORDER.indexOf(right.basis));
  return <span className="grid w-full min-w-0 max-w-full gap-2">
    <select aria-label={`Owner’s email for ${label}`} className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-gray-border bg-surface px-3 text-[13px]" value={value.choice}
      onChange={(event) => onChange({ ...value, choice: event.target.value })}>
      <option value="">No owner link yet</option>
      {sorted.map((candidate) => <option key={`${candidate.basis}:${candidate.email}`} value={candidate.email}>{candidate.name ? `${candidate.name} · ` : ""}{candidate.email} ({BASIS_LABELS[candidate.basis]})</option>)}
      <option value={OTHER}>Someone else</option>
    </select>
    {value.choice === OTHER ? <input type="email" autoComplete="off" aria-label={`Owner’s email for ${label}, someone else`} placeholder="owner@business.com" maxLength={254}
      className="min-h-11 w-full min-w-0 rounded-xl border border-gray-border bg-surface px-3 text-[13px]" value={value.other} onChange={(event) => onChange({ ...value, other: event.target.value })} /> : null}
  </span>;
}

/**
 * HighLevel as a source (lane L6 owns the connection and the read). Connecting
 * leaves Strelva for HighLevel's own consent screen; reading lists the
 * sub-accounts as rows and adds nothing.
 */
function HighLevelSource({ agencyWorkspaceId, connection, setupReady, busy, onRead }: { agencyWorkspaceId: string; connection: HighLevelConnection | null | undefined; setupReady: boolean | undefined; busy: boolean; onRead: () => void }) {
  const connect = `/api/workspace/agency-clients/gohighlevel/oauth?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`;
  if (connection === undefined) return <p role="status" className="text-[13px] text-gray-muted">Checking your HighLevel connection</p>;
  if (setupReady === false && connection?.status !== "connected") {
    return <StNotice>HighLevel isn’t set up on Strelva yet. Paste rows or upload a file instead.</StNotice>;
  }
  if (!connection || connection.status !== "connected") {
    return <StNotice action={<a href={connect} className="inline-flex min-h-11 items-center text-[13px] font-medium underline underline-offset-4">Connect HighLevel</a>}>
      {connection?.status === "needs_reauth" || connection?.status === "revoked" ? "Your HighLevel connection stopped working. Connect it again to read your sub-accounts." : "Connect your HighLevel agency account once. Strelva reads your sub-accounts and never changes anything in HighLevel."}
    </StNotice>;
  }
  return <div className="grid gap-3">
    <StCopy muted>Each sub-account becomes one row in the preview. Where HighLevel has more than one person on a sub-account, you choose the owner.</StCopy>
    <div><StPill busy={busy} onClick={onRead}>Read sub-accounts</StPill></div>
  </div>;
}

function columnChoice(current: ClientSheetMapping, field: ClientSheetField, value: string): ClientSheetMapping {
  const next: ClientSheetMapping = { ...current };
  if (value === "") { delete next[field]; return next; }
  const column = Number(value);
  // One column feeds one field.
  for (const other of CLIENT_SHEET_FIELDS) if (next[other] === column) delete next[other];
  next[field] = column;
  return next;
}

function summary(counts: Record<ClientImportRowState, number>) {
  return ([["added", "added"], ["ready", "ready"], ["duplicate", "already clients"], ["incomplete", "incomplete"], ["refused", "not added"]] as const)
    .filter(([state]) => counts[state]).map(([state, label]) => `${counts[state]} ${label}`).join(" · ") || "No rows";
}

function Frame({ agencyHref, children }: { agencyHref: string; children: React.ReactNode }) {
  return <main data-workspace-theme="linen" className="min-h-dvh bg-canvas">
    <StPage width="wide">
      <StHead crumb={{ label: "Clients", href: agencyHref }} title="Import clients" meta="Bring the clients you already have from a list, in one go." />
      {children}
    </StPage>
  </main>;
}
