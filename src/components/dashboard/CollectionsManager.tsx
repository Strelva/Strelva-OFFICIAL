"use client";

/**
 * Basic client-facing CMS editor (Collections). Intentionally minimal: list
 * entries per type, create/edit structured fields, publish/unpublish, delete.
 * No page-building or rich layout (the AI agent handles richer authoring; this
 * is the direct-edit surface). Talks to /api/collections/[type].
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

type CollectionType = "blog" | "video" | "product";

interface EntryView {
  slug: string;
  status: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

interface FieldDef {
  name: string;
  label: string;
  kind: "text" | "textarea" | "number" | "tags" | "url" | "bool";
}

// Client-side mirror of the field shapes in src/lib/cms/collection-types.ts.
const FIELDS: Record<CollectionType, FieldDef[]> = {
  blog: [
    { name: "title", label: "Title", kind: "text" },
    { name: "excerpt", label: "Excerpt", kind: "text" },
    { name: "body", label: "Body", kind: "textarea" },
    { name: "author", label: "Author", kind: "text" },
    { name: "tags", label: "Tags (comma separated)", kind: "tags" },
    { name: "coverImage", label: "Cover image URL", kind: "url" },
  ],
  video: [
    { name: "title", label: "Title", kind: "text" },
    { name: "description", label: "Description", kind: "textarea" },
    { name: "videoUrl", label: "Video URL", kind: "url" },
    { name: "thumbnail", label: "Thumbnail URL", kind: "url" },
    { name: "tags", label: "Tags (comma separated)", kind: "tags" },
  ],
  product: [
    { name: "name", label: "Name", kind: "text" },
    { name: "description", label: "Description", kind: "textarea" },
    { name: "priceCents", label: "Price (cents)", kind: "number" },
    { name: "currency", label: "Currency", kind: "text" },
    { name: "inStock", label: "In stock", kind: "bool" },
    { name: "checkoutUrl", label: "Checkout URL", kind: "url" },
  ],
};

const TYPE_LABEL: Record<CollectionType, string> = { blog: "Blog", video: "Video", product: "Products" };

function emptyData(type: CollectionType): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const f of FIELDS[type]) {
    d[f.name] = f.kind === "tags" ? [] : f.kind === "number" ? 0 : f.kind === "bool" ? true : "";
  }
  return d;
}

export function CollectionsManager({
  types,
  initialType,
  initialEntries,
}: {
  types: CollectionType[];
  initialType: CollectionType;
  initialEntries: EntryView[];
}) {
  const [type, setType] = useState<CollectionType>(initialType);
  const [entries, setEntries] = useState<EntryView[]>(initialEntries);
  const [editing, setEditing] = useState<{ slug?: string; data: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: CollectionType) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${t}`);
      const json = await res.json();
      setEntries(
        (json.entries ?? []).map((e: { slug: string; status: string; data: Record<string, unknown>; updated_at?: string; updatedAt?: string }) => ({
          slug: e.slug,
          status: e.status,
          data: e.data,
          updatedAt: e.updatedAt ?? e.updated_at ?? "",
        }))
      );
    } catch {
      setError("Could not load entries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (type !== initialType) void load(type);
  }, [type, initialType, load]);

  async function save(status: "draft" | "published") {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: editing.slug, data: editing.data, status }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      setEditing(null);
      await load(type);
    } finally {
      setSaving(false);
    }
  }

  async function remove(slug: string) {
    if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    await fetch(`/api/collections/${type}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    await load(type);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-warm-black">Content</h1>
        <button
          onClick={() => setEditing({ data: emptyData(type) })}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-warm-white"
        >
          <Plus className="h-4 w-4" /> New {TYPE_LABEL[type].replace(/s$/, "")}
        </button>
      </div>

      {types.length > 1 && (
        <div className="mb-4 flex gap-2">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => { setType(t); setEditing(null); }}
              className={`rounded-md px-3 py-1.5 text-sm ${t === type ? "bg-warm-black text-warm-white" : "border border-gray-border text-warm-black"}`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {editing ? (
        <div className="rounded-lg border border-gray-border p-4">
          {FIELDS[type].map((f) => (
            <label key={f.name} className="mb-3 block text-sm">
              <span className="mb-1 block font-medium text-warm-black">{f.label}</span>
              <FieldInput
                field={f}
                value={editing.data[f.name]}
                onChange={(v) => setEditing({ ...editing, data: { ...editing.data, [f.name]: v } })}
              />
            </label>
          ))}
          <div className="mt-4 flex gap-2">
            <button disabled={saving} onClick={() => save("published")} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-warm-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
            </button>
            <button disabled={saving} onClick={() => save("draft")} className="rounded-md border border-gray-border px-3 py-1.5 text-sm">
              Save draft
            </button>
            <button onClick={() => setEditing(null)} className="rounded-md px-3 py-1.5 text-sm text-warm-black/60">
              Cancel
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-warm-black/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <p className="py-10 text-sm text-warm-black/60">No {TYPE_LABEL[type].toLowerCase()} entries yet.</p>
      ) : (
        <ul className="divide-y divide-gray-border rounded-lg border border-gray-border">
          {entries.map((e) => (
            <li key={e.slug} className="flex items-center justify-between gap-3 p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing({ slug: e.slug, data: e.data })}>
                <span className="block truncate text-sm font-medium text-warm-black">
                  {String(e.data.title ?? e.data.name ?? e.slug)}
                </span>
                <span className="text-xs text-warm-black/50">{e.status}</span>
              </button>
              <button onClick={() => remove(e.slug)} aria-label="Delete" className="text-warm-black/40 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const base = "w-full rounded-md border border-gray-border px-3 py-1.5 text-sm";
  if (field.kind === "textarea") {
    return <textarea rows={6} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.kind === "number") {
    return <input type="number" className={base} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />;
  }
  if (field.kind === "bool") {
    return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.kind === "tags") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <input
        className={base}
        value={arr.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    );
  }
  return <input type={field.kind === "url" ? "url" : "text"} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
}
