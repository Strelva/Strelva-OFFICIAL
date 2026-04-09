"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronUp, ChevronDown, Eye, EyeOff, Save, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import type { PageSectionConfig, SeoMeta, SitePageConfig } from "@/lib/types";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";
import { useDashboard } from "./DashboardContext";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import { ImageField } from "./ImageField";

interface PageStructurePanelProps {
  page?: string;
  onClose?: () => void;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Page structure editor. Lets Amy create/rename/delete pages, reorder sections,
 * and toggle visibility. Persists the full SitePageConfig to /api/page-config.
 *
 * The `home` page is protected — it cannot be renamed or deleted so the site
 * always has a root route.
 */
export function PageStructurePanel({ page: initialPage = "home", onClose }: PageStructurePanelProps) {
  const { template, triggerRefresh } = useDashboard();
  const DEFAULTS = getDefaultPageConfig(template);

  const [config, setConfig] = useState<SitePageConfig | null>(null);
  const [page, setPage] = useState(initialPage);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SEO block defaults collapsed so it doesn't crowd the section list.
  const [seoOpen, setSeoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/page-config", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        // Start from defaults, then overlay stored pages. This guarantees
        // every default page exists even if storage only has some of them,
        // and preserves any extra pages Amy created.
        const merged: SitePageConfig = { ...DEFAULTS };
        if (data && typeof data === "object") {
          for (const [slug, pageCfg] of Object.entries(data as SitePageConfig)) {
            const def = DEFAULTS[slug];
            if (def) {
              // Merge: keep stored order, append any new default sections
              const storedTypes = new Set(
                pageCfg.sections.map((s: PageSectionConfig) => s.type)
              );
              const newOnes = def.sections.filter((s) => !storedTypes.has(s.type));
              merged[slug] = {
                sections: [...pageCfg.sections, ...newOnes],
                // Prefer stored seo; fall back to template defaults so
                // new keys land even after pages were saved once.
                seo: pageCfg.seo ?? def.seo,
              };
            } else {
              merged[slug] = pageCfg;
            }
          }
        }
        setConfig(merged);
        if (!merged[page]) setPage("home");
      })
      .catch(() => {
        if (!cancelled) setConfig(DEFAULTS);
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = (config?.[page]?.sections ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  const update = useCallback((next: PageSectionConfig[]) => {
    if (!config) return;
    next.forEach((s, i) => { s.order = i; });
    const existing = config[page] ?? { sections: [] };
    setConfig({ ...config, [page]: { ...existing, sections: next } });
    setDirty(true);
  }, [config, page]);

  const currentSeo: SeoMeta = config?.[page]?.seo ?? {};

  function updateSeo(patch: Partial<SeoMeta>) {
    if (!config) return;
    const existing = config[page] ?? { sections: [] };
    const nextSeo = { ...(existing.seo ?? {}), ...patch };
    setConfig({
      ...config,
      [page]: { ...existing, seo: nextSeo },
    });
    setDirty(true);
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const next = sections.slice();
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    update(next);
  }

  function moveDown(i: number) {
    if (i === sections.length - 1) return;
    const next = sections.slice();
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    update(next);
  }

  function toggle(i: number) {
    const next = sections.slice();
    next[i] = { ...next[i], visible: !next[i].visible };
    update(next);
  }

  function createPage() {
    if (!config) return;
    const raw = window.prompt("New page slug (lowercase letters, numbers, hyphens):", "");
    if (!raw) return;
    const slug = raw.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      setError(`Invalid slug "${slug}". Use lowercase letters, numbers, hyphens.`);
      return;
    }
    if (config[slug]) {
      setError(`Page "${slug}" already exists.`);
      return;
    }
    setError(null);
    setConfig({ ...config, [slug]: { sections: [] } });
    setPage(slug);
    setDirty(true);
  }

  function renamePage() {
    if (!config) return;
    if (page === "home") {
      setError("The home page cannot be renamed.");
      return;
    }
    const raw = window.prompt("Rename page to:", page);
    if (!raw) return;
    const slug = raw.trim().toLowerCase();
    if (slug === page) return;
    if (!SLUG_RE.test(slug)) {
      setError(`Invalid slug "${slug}".`);
      return;
    }
    if (config[slug]) {
      setError(`Page "${slug}" already exists.`);
      return;
    }
    const { [page]: current, ...rest } = config;
    setError(null);
    setConfig({ ...rest, [slug]: current });
    setPage(slug);
    setDirty(true);
  }

  function deletePage() {
    if (!config) return;
    if (page === "home") {
      setError("The home page cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete page "${page}"? This cannot be undone.`)) return;
    const { [page]: _removed, ...rest } = config;
    setError(null);
    setConfig(rest);
    setPage("home");
    setDirty(true);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/page-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDirty(false);
      triggerRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="p-4 text-sm text-gray-muted">Loading page structure…</div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="h-10 px-4 flex items-center justify-between border-b border-gray-border shrink-0">
        <div className="text-xs font-medium uppercase tracking-wider text-gray-muted">
          Page structure
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-gray-muted hover:text-warm-black"
          >
            Close
          </button>
        )}
      </div>

      <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-border shrink-0">
        <select
          value={page}
          onChange={(e) => setPage(e.target.value)}
          className="flex-1 text-xs px-2 py-1.5 border border-gray-border rounded-md bg-white"
          aria-label="Select page"
        >
          {Object.keys(config).sort((a, b) => (a === "home" ? -1 : b === "home" ? 1 : a.localeCompare(b))).map((slug) => (
            <option key={slug} value={slug}>
              {slug === "home" ? "home (/)" : `/${slug}`}
            </option>
          ))}
        </select>
        <button
          onClick={createPage}
          title="New page"
          aria-label="New page"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-border text-gray-muted hover:text-warm-black"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={renamePage}
          disabled={page === "home"}
          title={page === "home" ? "Home cannot be renamed" : "Rename page"}
          aria-label="Rename page"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-border text-gray-muted hover:text-warm-black disabled:opacity-30"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={deletePage}
          disabled={page === "home"}
          title={page === "home" ? "Home cannot be deleted" : "Delete page"}
          aria-label="Delete page"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-border text-gray-muted hover:text-red-600 disabled:opacity-30"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Per-page SEO. Collapsed by default so the section list stays
            the primary focus. Empty fields fall back to site settings
            at render time in GLDF's generateMetadata. */}
        <div className="mb-3 rounded-md border border-gray-border bg-white">
          <button
            type="button"
            onClick={() => setSeoOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-2 py-2 text-left"
            aria-expanded={seoOpen}
          >
            {seoOpen ? (
              <ChevronDown className="w-3 h-3 text-gray-muted" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-muted" />
            )}
            <span className="text-xs font-medium uppercase tracking-wider text-gray-muted">
              SEO
            </span>
            <span className="ml-auto text-[10px] text-gray-muted">
              {currentSeo.title || currentSeo.description ? "custom" : "defaults"}
            </span>
          </button>
          {seoOpen && (
            <div className="px-3 pb-3 space-y-2 border-t border-gray-border">
              <label className="block">
                <span className="block text-[11px] text-gray-muted mb-1">Title</span>
                <input
                  type="text"
                  value={currentSeo.title ?? ""}
                  onChange={(e) => updateSeo({ title: e.target.value })}
                  placeholder="Falls back to site name + tagline"
                  className="w-full text-xs px-2 py-1.5 border border-gray-border rounded-md bg-white"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] text-gray-muted mb-1">Description</span>
                <textarea
                  value={currentSeo.description ?? ""}
                  onChange={(e) => updateSeo({ description: e.target.value })}
                  placeholder="Falls back to site description"
                  rows={3}
                  className="w-full text-xs px-2 py-1.5 border border-gray-border rounded-md bg-white resize-y"
                />
              </label>
              <ImageField
                label="OG Image"
                value={currentSeo.ogImage ?? ""}
                onChange={(val) => updateSeo({ ogImage: val })}
              />
            </div>
          )}
        </div>

        <ul className="space-y-1">
          {sections.map((s, i) => {
            const label = SECTION_LABELS[s.type] ?? s.type;
            return (
              <li
                key={`${s.type}-${i}`}
                className={`flex items-center gap-2 px-2 py-2 rounded-md border border-gray-border ${
                  s.visible ? "bg-white" : "bg-gray-bg opacity-60"
                }`}
              >
                <div className="flex flex-col">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="w-5 h-4 flex items-center justify-center text-gray-muted hover:text-warm-black disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === sections.length - 1}
                    className="w-5 h-4 flex items-center justify-center text-gray-muted hover:text-warm-black disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex-1 text-sm font-medium">{label}</div>

                <button
                  onClick={() => toggle(i)}
                  className="w-7 h-7 flex items-center justify-center text-gray-muted hover:text-warm-black"
                  aria-label={s.visible ? "Hide section" : "Show section"}
                  title={s.visible ? "Visible" : "Hidden"}
                >
                  {s.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="h-12 px-3 flex items-center justify-between border-t border-gray-border shrink-0">
        <div className="text-xs text-gray-muted">
          {error ? <span className="text-red-600">{error}</span> : dirty ? "Unsaved changes" : "Up to date"}
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-warm-black text-white disabled:opacity-40"
        >
          <Save className="w-3 h-3" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
