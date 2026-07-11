"use client";

/**
 * Basic client-facing CMS editor (Collections). Intentionally minimal: list
 * entries per type, create/edit structured fields, publish/unpublish, delete.
 * No page-building or rich layout (the AI agent handles richer authoring; this
 * is the direct-edit surface). Talks to /api/collections/[type].
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { useDashboardOptional } from "./DashboardContext";
import { AssetPickerModal } from "./AssetPickerModal";

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
  /** Required on save (mirrors the non-optional fields in the Zod registry). */
  required?: boolean;
  /** Holds an image URL — gets a "Choose from your photos" media picker. For a
   *  `tags` field this means the list is image URLs (product `images`). */
  image?: boolean;
}

// Client-side mirror of the field shapes in src/lib/cms/collection-types.ts.
// The Zod registry (collection-types.ts) owns the *validation* shape but not the
// UI metadata below (label, textarea-vs-text, help text, which URL is an image),
// so deriving this list from Zod would lose it — kept as an intentional mirror.
// `required` mirrors the Zod registry: blog/video title and product name are
// z.string().min(1); video.videoUrl is a required URL. URL-typed fields are
// validated for URL shape (when present) regardless of required.
const FIELDS: Record<CollectionType, FieldDef[]> = {
  blog: [
    { name: "title", label: "Title", kind: "text", required: true },
    { name: "excerpt", label: "Excerpt", kind: "text" },
    { name: "body", label: "Body", kind: "textarea" },
    { name: "author", label: "Author", kind: "text" },
    { name: "tags", label: "Tags (comma separated)", kind: "tags" },
    { name: "coverImage", label: "Cover image", kind: "url", image: true },
  ],
  video: [
    { name: "title", label: "Title", kind: "text", required: true },
    { name: "description", label: "Description", kind: "textarea" },
    { name: "videoUrl", label: "Video URL", kind: "url", required: true },
    { name: "thumbnail", label: "Thumbnail", kind: "url", image: true },
    { name: "tags", label: "Tags (comma separated)", kind: "tags" },
  ],
  product: [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "description", label: "Description", kind: "textarea" },
    { name: "priceCents", label: "Price in cents (2000 = $20.00)", kind: "number" },
    { name: "currency", label: "Currency", kind: "text" },
    { name: "images", label: "Product photos", kind: "tags", image: true },
    { name: "inStock", label: "In stock", kind: "bool" },
    { name: "checkoutUrl", label: "Checkout URL", kind: "url" },
  ],
};

/** True if the string parses as an absolute http(s) URL. */
function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate the editing data against the field defs. Returns a map of
 * fieldName -> error message for any offending field (empty map = valid).
 * - required text/url fields must be non-empty
 * - url-typed fields must be valid URLs when present
 * - tags fields holding image URLs (product `images`) must be valid URLs
 */
function validateEntry(type: CollectionType, data: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of FIELDS[type]) {
    if (f.kind === "url") {
      const raw = typeof data[f.name] === "string" ? (data[f.name] as string).trim() : "";
      if (!raw) {
        if (f.required) errors[f.name] = `${f.label} is required.`;
        continue;
      }
      if (!isValidUrl(raw)) {
        errors[f.name] = "Enter a full URL starting with http:// or https://";
      }
      continue;
    }
    if (f.kind === "tags") {
      // Image-URL tag fields (product `images`) must hold valid URLs.
      const isUrlList = f.name === "images";
      if (isUrlList) {
        const arr = Array.isArray(data[f.name]) ? (data[f.name] as string[]) : [];
        const bad = arr.find((v) => !isValidUrl(v.trim()));
        if (bad) errors[f.name] = "Each image must be a full URL starting with http:// or https://";
      }
      continue;
    }
    if (f.required) {
      const raw = typeof data[f.name] === "string" ? (data[f.name] as string).trim() : "";
      if (!raw) errors[f.name] = `${f.label} is required.`;
    }
  }
  return errors;
}

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
  const dashboard = useDashboardOptional();
  const readOnly = dashboard?.readOnly ?? false;
  // Prefix the dashboard base path so collection CRUD works under /client/{tenant}
  // path-fallback hosting, not just subdomains.
  const apiPath = useMemo(() => dashboard?.dashboardHref ?? ((p: string) => p), [dashboard]);
  const [type, setType] = useState<CollectionType>(initialType);
  const [entries, setEntries] = useState<EntryView[]>(initialEntries);
  const [editing, setEditing] = useState<{ slug?: string; data: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Transient confirmation after a successful save, distinguishing the action.
  const [savedAction, setSavedAction] = useState<"published" | "draft" | null>(null);
  // The image field currently choosing from the media library (null = closed).
  const [pickingField, setPickingField] = useState<FieldDef | null>(null);

  // Insert a chosen photo URL into the active field: replace for a single URL
  // field, append for an image list (product photos). Clears any stale error.
  const onPickImage = useCallback((url: string) => {
    setEditing((cur) => {
      if (!cur || !pickingField) return cur;
      const f = pickingField;
      const next =
        f.kind === "tags"
          ? [...(Array.isArray(cur.data[f.name]) ? (cur.data[f.name] as string[]) : []), url]
          : url;
      return { ...cur, data: { ...cur.data, [f.name]: next } };
    });
    setFieldErrors((prev) => {
      if (!pickingField || !prev[pickingField.name]) return prev;
      const copy = { ...prev };
      delete copy[pickingField.name];
      return copy;
    });
    setPickingField(null);
  }, [pickingField]);

  const load = useCallback(async (t: CollectionType) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath(`/api/collections/${t}`));
      // Guard status before treating the body as data — otherwise a non-JSON 5xx
      // resolves to {} and renders as an indistinguishable "empty collection".
      if (!res.ok) {
        setError("Could not load entries.");
        return;
      }
      const json = await res.json().catch(() => ({}));
      setEntries(
        // The authed GET returns raw rows (snake_case updated_at).
        (json.entries ?? []).map((e: { slug: string; status: string; data: Record<string, unknown>; updated_at?: string }) => ({
          slug: e.slug,
          status: e.status,
          data: e.data,
          updatedAt: e.updated_at ?? "",
        }))
      );
    } catch {
      setError("Could not load entries.");
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    if (type !== initialType) void load(type);
  }, [type, initialType, load]);

  async function save(status: "draft" | "published") {
    if (!editing) return;
    // Client-side validation: block the request and surface inline errors.
    const errors = validateEntry(type, editing.data);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Fix the highlighted fields before saving.");
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiPath(`/api/collections/${type}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: editing.slug, data: editing.data, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      setEditing(null);
      setSavedAction(status === "published" ? "published" : "draft");
      window.setTimeout(() => setSavedAction(null), 2500);
      await load(type);
    } finally {
      setSaving(false);
    }
  }

  async function remove(slug: string) {
    if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    setError(null);
    const res = await fetch(apiPath(`/api/collections/${type}?slug=${encodeURIComponent(slug)}`), { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Delete failed.");
      return;
    }
    await load(type);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-warm-black">{TYPE_LABEL[type]}</h1>
        <div className="flex items-center gap-3">
          {savedAction && (
            <span
              role="status"
              className="inline-flex items-center rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-medium text-positive"
            >
              {savedAction === "published" ? "Published" : "Saved"}
            </span>
          )}
          {!readOnly && (
            <button
              onClick={() => {
                setFieldErrors({});
                setError(null);
                setEditing({ data: emptyData(type) });
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
            >
              <Plus className="h-4 w-4" /> New {TYPE_LABEL[type].replace(/s$/, "")}
            </button>
          )}
        </div>
      </div>

      {types.length > 1 && (
        <div className="mb-4 flex gap-2">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => { setType(t); setEditing(null); setFieldErrors({}); setError(null); }}
              className={`rounded-md px-3 py-1.5 text-sm ${t === type ? "bg-warm-black text-warm-white" : "border border-gray-border text-warm-black"}`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-critical">{error}</p>}

      {editing ? (
        <div className="rounded-lg border border-gray-border p-4">
          {FIELDS[type].map((f) => (
            <label key={f.name} className="mb-3 block text-sm">
              <span className="mb-1 block font-medium text-warm-black">
                {f.label}
                {f.required && <span className="ml-1 text-critical">*</span>}
              </span>
              <FieldInput
                field={f}
                value={editing.data[f.name]}
                invalid={Boolean(fieldErrors[f.name])}
                readOnly={readOnly}
                onPickImage={f.image ? () => setPickingField(f) : undefined}
                onChange={(v) => {
                  setEditing({ ...editing, data: { ...editing.data, [f.name]: v } });
                  if (fieldErrors[f.name]) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next[f.name];
                      return next;
                    });
                  }
                }}
              />
              {fieldErrors[f.name] && (
                <span className="mt-1 block text-[12px] text-critical">{fieldErrors[f.name]}</span>
              )}
            </label>
          ))}
          <div className="mt-4 flex gap-2">
            {!readOnly && (
              <>
                <button disabled={saving} onClick={() => save("published")} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
                </button>
                <button disabled={saving} onClick={() => save("draft")} className="rounded-md border border-gray-border px-3 py-1.5 text-sm text-warm-black disabled:opacity-60">
                  Save draft
                </button>
              </>
            )}
            <button onClick={() => { setEditing(null); setFieldErrors({}); setError(null); }} className="rounded-md px-3 py-1.5 text-sm text-gray-muted">
              Cancel
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <p className="py-10 text-sm text-gray-muted">No {TYPE_LABEL[type].toLowerCase()} entries yet.</p>
      ) : (
        <ul className="divide-y divide-gray-border rounded-lg border border-gray-border">
          {entries.map((e) => (
            <li key={e.slug} className="flex items-center justify-between gap-3 p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => { setFieldErrors({}); setError(null); setEditing({ slug: e.slug, data: e.data }); }}>
                <span className="block truncate text-sm font-medium text-warm-black">
                  {String(e.data.title ?? e.data.name ?? e.slug)}
                </span>
                <span className="text-xs text-gray-muted">{e.status}</span>
              </button>
              {!readOnly && (
                <button onClick={() => remove(e.slug)} aria-label="Delete" className="text-gray-muted hover:text-critical">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AssetPickerModal
        open={pickingField !== null}
        onClose={() => setPickingField(null)}
        onSelect={onPickImage}
      />
    </div>
  );
}

function FieldInput({
  field,
  value,
  invalid = false,
  readOnly = false,
  onPickImage,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  invalid?: boolean;
  readOnly?: boolean;
  /** Present for image fields — opens the media library to insert a photo URL. */
  onPickImage?: () => void;
  onChange: (v: unknown) => void;
}) {
  const base = `w-full rounded-md border px-3 py-1.5 text-sm ${invalid ? "border-critical/50" : "border-gray-border"}`;

  // "Choose from your photos" — so an owner inserts an uploaded image URL instead
  // of pasting one. Shared by the single-URL image fields and the image list.
  const pickButton = onPickImage && !readOnly && (
    <button
      type="button"
      onClick={onPickImage}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gray-border px-2.5 py-1.5 text-[12px] font-medium text-warm-black transition-colors hover:border-accent/40"
    >
      <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.6} /> Choose from your photos
    </button>
  );

  if (field.kind === "textarea") {
    return <textarea rows={6} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.kind === "number") {
    return <input type="number" className={base} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />;
  }
  if (field.kind === "bool") {
    // Aligned label + checkbox row, consistent with the rest of the form.
    return (
      <span className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-border accent-accent"
        />
        <span className="text-sm text-gray-muted">{Boolean(value) ? "In stock" : "Out of stock"}</span>
      </span>
    );
  }
  if (field.kind === "tags") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <>
        <input
          className={base}
          value={arr.join(", ")}
          onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
        {pickButton}
      </>
    );
  }
  return (
    <>
      <input type={field.kind === "url" ? "url" : "text"} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      {pickButton}
    </>
  );
}
