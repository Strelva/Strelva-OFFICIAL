"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
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
    <label className="block rounded-xl border border-gray-border bg-surface-raised p-3.5">
      <span className="flex items-center justify-between gap-3 text-[13px] font-medium text-warm-black">
        {label.title}
        {value ? <Check className="h-3.5 w-3.5 text-positive" aria-label="Selected" /> : null}
      </span>
      <select
        value={value}
        onChange={(event) => onSelect(kind, event.target.value)}
        disabled={disabled}
        className="mt-2 w-full rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[13px] text-warm-black outline-none focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`${label.title} resource`}
      >
        <option value="">{group.resources.length ? "Choose a resource" : "No resource selected"}</option>
        {group.resources.map((item: GoogleResource) => (
          <option key={item.id} value={item.id}>
            {item.label}{item.detail ? ` · ${item.detail}` : ""}
          </option>
        ))}
      </select>
      <span className="mt-1.5 block text-[11px] leading-relaxed text-gray-muted">{statusText}</span>
      {saving === kind ? <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-gray-muted"><Loader2 className="h-3 w-3 animate-spin" />Saving selection…</span> : null}
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
    <section className="mb-8 rounded-2xl border border-glass-border bg-glass p-4 sm:p-5" aria-labelledby="google-resource-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Google account setup</p>
          <h2 id="google-resource-title" className="mt-1 text-[16px] font-medium text-warm-black">Choose what Strelva should use</h2>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-gray-muted">Your Google account can contain more than one property or listing. Pick the right ones here so nobody has to copy IDs into an admin screen.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || saving !== null} className="inline-flex min-h-[34px] shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-border px-3 py-2 text-[12px] text-gray-muted hover:border-accent/35 hover:text-warm-black disabled:opacity-60">
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Refresh
        </button>
      </div>
      {loading && !catalog ? <p className="mt-5 text-[12px] text-gray-muted">Loading resources from Google…</p> : null}
      {catalog ? <div className="mt-5 grid gap-3 md:grid-cols-3">
        {(["gsc", "ga4", "gbp"] as const).map((kind) => <ResourceSelect key={kind} kind={kind} catalog={catalog} saving={saving} onSelect={(nextKind, id) => void select(nextKind, id)} />)}
      </div> : null}
      {error ? <p className="mt-4 text-[12px] text-critical" role="alert">{error}</p> : null}
    </section>
  );
}
