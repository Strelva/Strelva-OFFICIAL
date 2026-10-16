"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useDashboardOptional } from "./DashboardContext";
import type { GoogleResource, GoogleResourceCatalog } from "@/lib/google-resources";

type ResourceKind = "gsc" | "ga4" | "gbp";

/** What each Google account part is for, in owner words (GLOSSARY: Google listing). */
const WORDS: Record<ResourceKind, { what: string; ask: string; none: string }> = {
  gsc: { what: "what people search before they find you", ask: "Which site should Strelva read searches for?", none: "This Google account has no search data for your site yet." },
  ga4: { what: "who visits your site", ask: "Which site should Strelva count visits for?", none: "This Google account has no visit counts for your site yet." },
  gbp: { what: "your Google listing", ask: "Which Google listing is yours?", none: "This Google account has no Google listing yet." },
};

function selectedId(kind: ResourceKind, catalog: GoogleResourceCatalog): string {
  if (kind === "gbp") {
    return catalog.gbp.selected ? `${catalog.gbp.selected.accountId}|${catalog.gbp.selected.locationId}` : "";
  }
  return catalog[kind].selected ?? "";
}

function chosen(kind: ResourceKind, catalog: GoogleResourceCatalog): GoogleResource | null {
  const id = selectedId(kind, catalog);
  return id ? catalog[kind].resources.find((item) => item.id === id) ?? null : null;
}

/** A choice is missing when Google offers more than one and none is picked, or the permission was never given. */
function missing(kind: ResourceKind, catalog: GoogleResourceCatalog): boolean {
  const group = catalog[kind];
  if (group.status === "not_granted") return true;
  return group.status === "ready" && !selectedId(kind, catalog) && group.resources.length > 0;
}

/** One missing choice as one sentence, with the choice beside it. */
function ResourceChoice({ kind, catalog, saving, onSelect }: { kind: ResourceKind; catalog: GoogleResourceCatalog; saving: ResourceKind | null; onSelect: (kind: ResourceKind, id: string) => void }) {
  const group = catalog[kind];
  const words = WORDS[kind];
  if (group.status === "not_granted") return <p className="m-0 text-[15px] leading-[1.5] text-[var(--st-text-body)]">Strelva can&apos;t see {words.what} yet. Connect Google again and allow it.</p>;
  return <label className="flex flex-col gap-2">
    <span className="text-[15px] leading-[1.5] text-[var(--st-text-body)]">{words.ask}</span>
    <select value={selectedId(kind, catalog)} onChange={(event) => onSelect(kind, event.target.value)} disabled={saving !== null}
      className="min-h-[44px] w-full max-w-[420px] rounded-[var(--st-r-md)] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)] disabled:cursor-not-allowed disabled:opacity-60">
      <option value="">Pick one</option>
      {group.resources.map((item: GoogleResource) => <option key={item.id} value={item.id}>{item.label}{item.detail ? `, ${item.detail}` : ""}</option>)}
    </select>
    {saving === kind ? <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--st-text-2)]"><Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />Saving</span> : null}
  </label>;
}

/** What Strelva reads from Google, as one sentence: "Strelva reads harbordental.com and your Harbor Dental listing from Google." */
function readsSentence(catalog: GoogleResourceCatalog): string | null {
  const site = chosen("gsc", catalog) ?? chosen("ga4", catalog);
  const listing = chosen("gbp", catalog);
  const parts = [site ? site.label : null, listing ? `your ${listing.label} listing` : null].filter(Boolean);
  return parts.length ? `Strelva reads ${parts.join(" and ")} from Google.` : null;
}

export function GoogleResourceSelector({ connected }: { connected: boolean }) {
  const dashboard = useDashboardOptional();
  const apiHref = useMemo(() => dashboard?.dashboardHref ?? ((path: string) => path), [dashboard?.dashboardHref]);
  const [catalog, setCatalog] = useState<GoogleResourceCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<ResourceKind | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiHref("/api/connections/google/resources"), { credentials: "same-origin" });
      const body = await response.json().catch(() => null) as GoogleResourceCatalog | { error?: string } | null;
      if (!response.ok) throw new Error((body as { error?: string } | null)?.error || "Could not load Google resources.");
      setCatalog(body as GoogleResourceCatalog);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Google resources.");
    } finally {
      setLoading(false);
    }
  }, [apiHref, connected]);

  useEffect(() => { void load(); }, [load]);

  async function select(kind: ResourceKind, resourceId: string) {
    if (!resourceId) return;
    setSaving(kind);
    setError("");
    try {
      const response = await fetch(apiHref("/api/connections/google/resources"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ kind, resourceId }),
      });
      const body = await response.json().catch(() => null) as GoogleResourceCatalog | { error?: string } | null;
      if (!response.ok) throw new Error((body as { error?: string } | null)?.error || "Could not save that resource.");
      setCatalog(body as GoogleResourceCatalog);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that resource.");
    } finally {
      setSaving(null);
    }
  }

  if (!connected) return null;
  const kinds = (["gbp", "gsc", "ga4"] as const).filter((kind) => catalog && missing(kind, catalog));
  const sentence = catalog ? readsSentence(catalog) : null;

  return (
    <section className="flex flex-col gap-3" aria-label="What Strelva reads from Google">
      {loading && !catalog ? <p className="m-0 text-[15px] text-[var(--st-text-2)]">Asking Google what this account holds</p> : null}
      {sentence ? <p className="m-0 text-[15px] leading-[1.5] text-[var(--st-text-body)]">{sentence}</p> : null}
      {catalog ? kinds.map((kind) => <ResourceChoice key={kind} kind={kind} catalog={catalog} saving={saving} onSelect={(nextKind, id) => void select(nextKind, id)} />) : null}
      {error ? <p className="m-0 text-[14px] text-[var(--st-critical)]" role="alert">{error} <button type="button" onClick={() => void load()} className="border-0 bg-transparent p-0 font-medium text-[var(--st-accent)] hover:underline">Try again</button></p> : null}
    </section>
  );
}
