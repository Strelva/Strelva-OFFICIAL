"use client";

import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { ChevronUp, ChevronDown, Trash2, Plus, Check, Loader2 } from "lucide-react";
import type { PageConfig, PageSectionConfig, SitePageConfig } from "@/lib/types";
import { BLOCK_DEFINITIONS, BLOCK_TYPES, getBlockDefinition, blockDefaults } from "@/lib/blocks/registry";
import { BlockRenderer } from "@/components/public/blocks";
import { useDashboardOptional } from "./DashboardContext";

type Status = "idle" | "saving" | "saved" | "publishing" | "error";

/** Resolve a lucide icon by name from the registry. */
function PaletteIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>>)[name];
  if (!Cmp) return <Icons.Square className={className} strokeWidth={1.6} />;
  return <Cmp className={className} strokeWidth={1.6} />;
}

export function BlockEditor() {
  const dashboard = useDashboardOptional();
  const readOnly = dashboard?.readOnly ?? false;
  const apiPath = (p: string) => dashboard?.dashboardHref(p) ?? p;

  const [config, setConfig] = useState<SitePageConfig | null>(null);
  const [page] = useState("home");
  const [sections, setSections] = useState<PageSectionConfig[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch(apiPath("/api/page-config?draft=true"), { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SitePageConfig | null) => {
        const cfg = data && typeof data === "object" ? data : {};
        setConfig(cfg);
        const pageSections = (cfg[page]?.sections ?? []).slice().sort((a, b) => a.order - b.order);
        setSections(pageSections);
      })
      .catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renumber order to match array position. */
  function normalize(list: PageSectionConfig[]): PageSectionConfig[] {
    return list.map((s, i) => ({ ...s, order: i }));
  }

  function commit(next: PageSectionConfig[]) {
    const list = normalize(next);
    setSections(list);
    setStatus("idle");
  }

  function addBlock(type: string) {
    commit([...sections, { type, visible: true, order: sections.length, props: blockDefaults(type) }]);
    setSelected(sections.length);
    setPaletteOpen(false);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = sections.slice();
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
    setSelected(target);
  }

  function remove(index: number) {
    commit(sections.filter((_, i) => i !== index));
    setSelected(null);
  }

  function setProp(index: number, key: string, value: unknown) {
    const next = sections.slice();
    next[index] = { ...next[index], props: { ...(next[index].props ?? {}), [key]: value } };
    setSections(next);
    setStatus("idle");
  }

  async function persist(publish: boolean) {
    if (readOnly) return;
    setStatus(publish ? "publishing" : "saving");
    const nextConfig: SitePageConfig = {
      ...(config ?? {}),
      [page]: { ...(config?.[page] as PageConfig | undefined), sections: normalize(sections) },
    };
    try {
      const res = await fetch(apiPath(`/api/page-config${publish ? "" : "?draft=true"}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(nextConfig),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setConfig(nextConfig);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  const selectedDef = selected !== null ? getBlockDefinition(sections[selected]?.type) : undefined;
  const palette = useMemo(() => BLOCK_TYPES.map((t) => BLOCK_DEFINITIONS[t]), []);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-gray-muted">
        Couldn&apos;t load the page. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-dashboard>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-glass-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-warm-black">Build</p>
          <span className="text-[12px] text-gray-muted">{sections.length} block{sections.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "saved" && <span className="text-[12px] text-success">Saved</span>}
          {status === "error" && <span className="text-[12px] text-red-400">Couldn&apos;t save</span>}
          <button
            type="button"
            onClick={() => persist(false)}
            disabled={readOnly || status === "saving"}
            className="rounded-lg border border-glass-border px-3 py-1.5 text-[12px] font-medium text-gray-muted transition-colors hover:text-warm-black disabled:opacity-50"
          >
            {status === "saving" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => persist(true)}
            disabled={readOnly || status === "publishing"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-50"
          >
            {status === "publishing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />}
            Publish
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: block list + palette */}
        <div className="flex w-[240px] shrink-0 flex-col border-r border-glass-border">
          <div className="flex-1 overflow-y-auto p-2">
            {sections.length === 0 && (
              <p className="px-2 py-4 text-[12px] leading-relaxed text-gray-muted">
                Empty page. Add your first block below.
              </p>
            )}
            {sections.map((sec, i) => {
              const def = getBlockDefinition(sec.type);
              const isBlock = Boolean(def);
              return (
                <div
                  key={i}
                  className={`group mb-1 flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                    selected === i ? "border-accent/40 bg-accent-dim/40" : "border-transparent hover:bg-gray-bg"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => isBlock && setSelected(i)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <PaletteIcon name={def?.icon ?? "Lock"} className="h-3.5 w-3.5 shrink-0 text-gray-muted" />
                    <span className="truncate text-[12px] text-warm-black">{def?.label ?? sec.type}</span>
                  </button>
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" onClick={() => move(i, -1)} className="rounded p-0.5 text-gray-faint hover:text-warm-black" aria-label="Move up">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} className="rounded p-0.5 text-gray-faint hover:text-warm-black" aria-label="Move down">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(i)} className="rounded p-0.5 text-gray-faint hover:text-red-400" aria-label="Delete">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-glass-border p-2">
            <button
              type="button"
              onClick={() => setPaletteOpen((o) => !o)}
              disabled={readOnly}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-bg px-3 py-2 text-[12px] font-medium text-warm-black transition-colors hover:bg-gray-bg-hover disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add block
            </button>
            {paletteOpen && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {palette.map((def) => (
                  <button
                    key={def.type}
                    type="button"
                    onClick={() => addBlock(def.type)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-glass-border px-2 py-2.5 text-center transition-colors hover:border-accent/40 hover:bg-gray-bg"
                  >
                    <PaletteIcon name={def.icon} className="h-4 w-4 text-gray-muted" />
                    <span className="text-[10px] text-gray-muted">{def.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: live preview */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-gray-bg/40 p-6">
          <div className="mx-auto max-w-3xl space-y-6 rounded-xl bg-white p-6 shadow-sm sm:p-10">
            {sections.filter((s) => getBlockDefinition(s.type)).length === 0 && (
              <p className="py-16 text-center text-[13px] text-gray-400">Your blocks preview here.</p>
            )}
            {sections.map((sec, i) =>
              getBlockDefinition(sec.type) ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={`block w-full rounded-lg text-left outline-none ring-offset-2 transition-shadow ${selected === i ? "ring-2 ring-accent" : "hover:ring-1 hover:ring-gray-300"}`}
                >
                  <BlockRenderer block={sec} />
                </button>
              ) : null,
            )}
          </div>
        </div>

        {/* Right: props panel */}
        <div className="w-[300px] shrink-0 overflow-y-auto border-l border-glass-border p-4">
          {selected !== null && selectedDef ? (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <PaletteIcon name={selectedDef.icon} className="h-4 w-4 text-accent" />
                <p className="text-[13px] font-medium text-warm-black">{selectedDef.label}</p>
              </div>
              <div className="space-y-3.5">
                {selectedDef.fields.map((field) => (
                  <PropField
                    key={field.key}
                    field={field}
                    value={(sections[selected]?.props ?? {})[field.key]}
                    onChange={(v) => setProp(selected, field.key, v)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-gray-muted">Select a block to edit it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PropField({
  field,
  value,
  onChange,
}: {
  field: import("@/lib/blocks/types").BlockFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const v = value ?? "";
  const inputCls =
    "w-full rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[13px] text-warm-black outline-none focus:border-accent/40 transition-colors";
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-muted">{field.label}</label>
      {field.type === "textarea" ? (
        <textarea rows={3} value={String(v)} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-none`} />
      ) : field.type === "select" ? (
        <select value={String(v)} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <button
          type="button"
          onClick={() => onChange(!(v === true || v === "true"))}
          className={`inline-flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${v === true || v === "true" ? "bg-accent" : "bg-gray-bg-hover"}`}
        >
          <span className={`h-5 w-5 rounded-full bg-warm-white transition-transform ${v === true || v === "true" ? "translate-x-5" : ""}`} />
        </button>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          value={String(v)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      )}
      {field.help && <p className="mt-1 text-[11px] text-gray-faint">{field.help}</p>}
    </div>
  );
}
