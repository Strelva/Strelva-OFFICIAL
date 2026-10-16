"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useDashboardOptional } from "./DashboardContext";
import type { GoogleResource, GoogleResourceCatalog } from "@/lib/google-resources";

type ResourceKind = "gsc" | "ga4" | "gbp";

const LABELS: Record<ResourceKind, { title: string; empty: string }> = {
  gsc: { title: "Search Console", empty: "No Search Console properties are available to this Google account." },
  ga4: { title: "Analytics", empty: "No GA4 properties are available to this Google account." },
  gbp: { title: "Business Profile", empty: "No Business Profile locations are available to this Google account." },
};

function selectedId(kind: ResourceKind, catalog: GoogleResourceCatalog): string {
  if (kind === "gbp") {
    return catalog.gbp.selected ? `${catalog.gbp.selected.accountId}|${catalog.gbp.selected.locationId}` : "";
  }
  return catalog[kind].selected ?? "";
}

function ResourceSelect({
  kind,
  catalog,
  saving,
  onSelect,
}: {
  kind: ResourceKind;
  catalog: GoogleResourceCatalog;
  saving: ResourceKind | null;
  onSelect: (kind: ResourceKind, id: string) => void;
}) {
  const group = catalog[kind];
  const label = LABELS[kind];
  const value = selectedId(kind, catalog);
  const disabled = group.status !== "ready" || saving !== null;
  const statusText = group.status === "not_granted"
    ? "Reconnect Google to grant this permission."
    : group.status === "unavailable"
      ? "Could not load resources. Try again."
      : group.resources.length === 0
        ? label.empty
        : "Choose the resource this business uses.";

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-[13px] font-medium text-warm-black">
        {label.title}
        {value ? <Check className="h-3.5 w-3.5 text-positive" aria-label="Selected" /> : null}
      </span>
      <select
        value={value}
        onChange={(event) => onSelect(kind, event.target.value)}
        disabled={disabled}
        className="mt-2 min-h-[44px] w-full rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)] disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`${label.title} resource`}
      >
        <option value="">{group.resources.length ? "Choose a resource" : "No resource selected"}</option>
        {group.resources.map((item: GoogleResource) => (
          <option key={item.id} value={item.id}>
            {item.label}{item.detail ? ` · ${item.detail}` : ""}
          </option>
        ))}
      </select>
      <span className="mt-1.5 block text-[13px] leading-relaxed text-gray-muted">{statusText}</span>
      {saving === kind ? <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-gray-muted"><Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />Saving</span> : null}
    </label>
  );
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

  return (
    <section className="flex flex-col gap-3" aria-labelledby="google-resource-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="google-resource-title" className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">Which Google listing and properties Strelva reads</h2>
        <button type="button" onClick={() => void load()} disabled={loading || saving !== null} className="border-0 bg-transparent p-0 text-[14px] font-medium text-[var(--st-accent)] hover:underline disabled:opacity-60">{loading ? "Asking Google" : "Ask Google again"}</button>
      </div>
      <p className="m-0 max-w-2xl text-[14px] leading-relaxed text-[var(--st-text-2)]">Your Google account can hold more than one listing or property. Pick the right ones here.</p>
      {loading && !catalog ? <p className="m-0 text-[14px] text-[var(--st-text-2)]">Reading your Google account</p> : null}
      {catalog ? <div className="grid gap-4 md:grid-cols-3">
        {(["gsc", "ga4", "gbp"] as const).map((kind) => <ResourceSelect key={kind} kind={kind} catalog={catalog} saving={saving} onSelect={(nextKind, id) => void select(nextKind, id)} />)}
      </div> : null}
      {error ? <p className="m-0 text-[14px] text-[var(--st-critical)]" role="alert">{error}</p> : null}
    </section>
  );
}
