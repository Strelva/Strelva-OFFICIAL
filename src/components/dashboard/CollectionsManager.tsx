"use client";

/**
 * Basic client-facing CMS editor (Collections). Intentionally minimal: list
 * entries per type, create/edit structured fields, publish/unpublish, delete.
 * No page-building or rich layout (the AI agent handles richer authoring; this
 * is the direct-edit surface). Talks to /api/collections/[type].
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaRow, XaRows, XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { ConfirmDialog } from "./ConfirmDialog";
import { DashNote, DashPage, DashSection } from "./xa/DashboardXa";
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

const TYPE_LABEL: Record<CollectionType, string> = { blog: "Blog posts", video: "Videos", product: "Products" };
const TYPE_ONE: Record<CollectionType, string> = { blog: "blog post", video: "video", product: "product" };

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
  // Every list on one page, one section each: no second level of switching.
  const [entriesByType, setEntriesByType] = useState<Partial<Record<CollectionType, EntryView[]>>>({ [initialType]: initialEntries });
  const [editing, setEditing] = useState<{ type: CollectionType; slug?: string; data: Record<string, unknown> } | null>(null);
  const type = editing?.type ?? initialType;
  const [loading, setLoading] = useState<Partial<Record<CollectionType, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Transient confirmation after a successful save, distinguishing the action.
  const [savedAction, setSavedAction] = useState<"published" | "draft" | null>(null);
  // The image field currently choosing from the media library (null = closed).
  const [pickingField, setPickingField] = useState<FieldDef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
    setLoading((current) => ({ ...current, [t]: true }));
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
      const rows: EntryView[] = (
        // The authed GET returns raw rows (snake_case updated_at).
        (json.entries ?? []).map((e: { slug: string; status: string; data: Record<string, unknown>; updated_at?: string }) => ({
          slug: e.slug,
          status: e.status,
          data: e.data,
          updatedAt: e.updated_at ?? "",
        }))
      );
      setEntriesByType((current) => ({ ...current, [t]: rows }));
    } catch {
      setError("Could not load entries.");
    } finally {
      setLoading((current) => ({ ...current, [t]: false }));
    }
  }, [apiPath]);

  useEffect(() => {
    for (const t of types) if (t !== initialType) void load(t);
  }, [types, initialType, load]);

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
    setError(null); setLiveNotice(null);
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
      if (json.liveSite?.status === "failed") setLiveNotice("Saved. Your live site did not refresh yet; it will pick this up within a few minutes.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(type: CollectionType, slug: string) {
    setError(null); setLiveNotice(null);
    const res = await fetch(apiPath(`/api/collections/${type}?slug=${encodeURIComponent(slug)}`), { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Delete failed.");
      return;
    }
    await load(type);
    if (json.liveSite?.status === "failed") setLiveNotice("Deleted. Your live site did not refresh yet; it will pick this up within a few minutes.");
  }

  const singular = TYPE_ONE[type];
  const closeEditor = () => { setEditing(null); setFieldErrors({}); setError(null); setLiveNotice(null); };
  const open = (t: CollectionType, entry?: EntryView) => { setFieldErrors({}); setError(null); setLiveNotice(null); setEditing(entry ? { type: t, slug: entry.slug, data: entry.data } : { type: t, data: emptyData(t) }); };
  const nameOf = (entry: EntryView) => String(entry.data.title ?? entry.data.name ?? entry.slug);
  const editingEntry = editing?.slug ? (entriesByType[editing.type] ?? []).find((entry) => entry.slug === editing.slug) ?? null : null;
  const listNames = types.map((t) => TYPE_LABEL[t].toLowerCase());

  return <DashPage
      title={editing ? (editing.slug ? `${nameOf({ slug: editing.slug, status: "", data: editing.data, updatedAt: "" })}.` : `A new ${singular}.`) : "Lists."}
      quiet={editing ? undefined : `Your ${listNames.length > 1 ? `${listNames.slice(0, -1).join(", ")} and ${listNames[listNames.length - 1]}` : listNames[0]}, as they appear on your site.`}
      label="Lists"
    >
      {readOnly ? <DashNote tone="quiet">You can read these. Only an owner or admin can save, put live or delete them.</DashNote> : null}
      {savedAction ? <DashNote tone="live" role="status">{savedAction === "published" ? "Live on your site." : "Saved as a draft. It isn't on your site yet."}</DashNote> : null}
      {error ? <DashNote tone="down" role="alert">{error}</DashNote> : null}
      {liveNotice ? <DashNote tone="quiet">{liveNotice}</DashNote> : null}
      {editing ? <section className="flex max-w-[640px] flex-col gap-5" aria-label={editing.slug ? `Change ${singular}` : `New ${singular}`}>
          <p className="m-0 text-[14px]"><XaTextLink onClick={closeEditor}>Back to Lists</XaTextLink></p>
          {FIELDS[type].map((f) => (
            <label key={f.name} className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-[var(--st-text-body)]">
                {f.label}{f.required ? <span className="text-[var(--st-text-3)]"> (needed)</span> : null}
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
              {fieldErrors[f.name] ? <span className="text-[13px] text-[var(--st-critical)]" role="alert">{fieldErrors[f.name]}</span> : null}
            </label>
          ))}
          {!readOnly ? <XaYes state={saving ? "going" : "waiting"} yesLabel="Make it live" onYes={() => void save("published")} block={false} shortcut={false} /> : null}
          <div className="flex flex-wrap items-center gap-4">
            {!readOnly ? <XaButton disabled={saving} onClick={() => void save("draft")}>Save draft</XaButton> : null}
            <XaTextLink onClick={closeEditor}>Cancel</XaTextLink>
            {!readOnly && editingEntry ? <XaTextLink onClick={() => setConfirmDelete(editingEntry.slug)}>Delete this {singular}</XaTextLink> : null}
          </div>
        </section> : types.map((t) => {
          const entries = entriesByType[t];
          return <DashSection key={t} label={TYPE_LABEL[t]} aside={!readOnly ? <XaTextLink onClick={() => open(t)}>{`New ${TYPE_ONE[t]}`}</XaTextLink> : undefined}>
            {loading[t] || !entries ? <div className="flex flex-col gap-3" aria-busy="true" aria-label={`Loading ${TYPE_LABEL[t].toLowerCase()}`}><StSkeleton /><StSkeleton width="70%" /></div>
              : entries.length === 0 ? <p className="m-0 text-[15px] text-[var(--st-text-2)]">No {TYPE_LABEL[t].toLowerCase()} yet.{readOnly ? "" : ` Start one with New ${TYPE_ONE[t]}.`}</p>
              : <XaRows label={TYPE_LABEL[t]}>{entries.map((entry) => <XaRow key={entry.slug} title={nameOf(entry)}
                  detail={entry.status === "published" ? (entry.updatedAt ? `Changed ${new Date(entry.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : undefined) : "Draft, not on your site yet"}
                  tone={entry.status === "published" ? undefined : "waits"}
                  onClick={() => open(t, entry)} />)}</XaRows>}
          </DashSection>;
        })}

      <ConfirmDialog open={Boolean(confirmDelete && editingEntry)} destructive title={`Delete this ${singular}?`} confirmLabel="Delete it" cancelLabel="Keep it"
        message={`“${editingEntry ? nameOf(editingEntry) : ""}” comes off your site and can't be brought back from here.`} onCancel={() => setConfirmDelete(null)} onConfirm={() => { const slug = confirmDelete; setConfirmDelete(null); if (slug && editing) { const t = editing.type; closeEditor(); void remove(t, slug); } }} />
      <AssetPickerModal
        open={pickingField !== null}
        onClose={() => setPickingField(null)}
        onSelect={onPickImage}
      />
    </DashPage>;
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
  const base = `min-h-[44px] w-full rounded-[var(--st-r-md)] border bg-[var(--st-surface)] px-3 py-2 text-[15px] text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)] disabled:opacity-60 ${invalid ? "border-[var(--st-critical)]" : "border-[var(--st-line)]"}`;

  // "Choose from your photos" — so an owner inserts an uploaded image URL instead
  // of pasting one. Shared by the single-URL image fields and the image list.
  const pickButton = onPickImage && !readOnly && <button type="button" className="inline-flex items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[14px] font-medium text-[var(--st-accent)] hover:underline" onClick={onPickImage}><ImageIcon size={15} aria-hidden="true" />Choose from your photos</button>;

  if (field.kind === "textarea") {
    return <textarea disabled={readOnly} rows={6} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.kind === "number") {
    return <input disabled={readOnly} type="number" className={base} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />;
  }
  if (field.kind === "bool") {
    // Aligned label + checkbox row, consistent with the rest of the form.
    return (
      <span className="inline-flex items-center gap-2">
        <input
          disabled={readOnly}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[var(--st-accent)]"
        />
        <span className="text-[14px] text-[var(--st-text-2)]">{Boolean(value) ? "In stock" : "Out of stock"}</span>
      </span>
    );
  }
  if (field.kind === "tags") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <>
        <input
          disabled={readOnly}
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
      <input disabled={readOnly} type={field.kind === "url" ? "url" : "text"} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      {pickButton}
    </>
  );
}
