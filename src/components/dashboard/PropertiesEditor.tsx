"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useDashboard } from "./DashboardContext";
import { ArrayItemEditor } from "./ArrayItemEditor";
import { StringArrayEditor } from "./StringArrayEditor";
import { ARRAY_CONFIGS } from "./arrayFieldConfigs";
import { getSiteModelSchema, type SimpleFieldDef, type SectionArrayConfig } from "./templateFieldConfigs";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaField, XaSays, XaStatus, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { ImageField } from "./ImageField";
import { ContentHistory } from "./ContentHistory";

// Composite sections that don't have their own content API —
// they pull from other sections on the public site.
const COMPOSITE_SECTION_INFO: Record<string, { label: string; sources: string; chatPrompt: string }> = {
  "trust-strip": {
    label: "Trust Strip",
    sources: "Settings & Contact",
    chatPrompt: "Update my trust strip stats",
  },
  "testimonial-quote": {
    label: "Quote",
    sources: "Reviews",
    chatPrompt: "Update my featured quote",
  },
  cta: {
    label: "Call to Action",
    sources: "page layout",
    chatPrompt: "Update my call to action section",
  },
  "instagram-feed": {
    label: "Instagram Feed",
    sources: "Settings",
    chatPrompt: "Update my Instagram handle",
  },
  "page-header": {
    label: "Page Header",
    sources: "page layout",
    chatPrompt: "Update my page header",
  },
  newsletter: {
    label: "Newsletter Signup",
    sources: "built-in",
    chatPrompt: "Update my newsletter section",
  },
  notify: {
    label: "Email Signup",
    sources: "built-in",
    chatPrompt: "Update my email signup section",
  },
  comparison: {
    label: "Comparison Table",
    sources: "built-in",
    chatPrompt: "Update my comparison table",
  },
  "booking-widget": {
    label: "Booking Widget",
    sources: "Services & Settings",
    chatPrompt: "Update my booking section",
  },
  "vagaro-booking": {
    label: "Vagaro Booking",
    sources: "Settings",
    chatPrompt: "Update my Vagaro booking embed",
  },
};

interface PropertiesEditorProps {
  activeSection: string | null;
}

type FieldDef = SimpleFieldDef;
type ReceiptTarget = { key: string; label: string };

// Walk a dot-path and return the leaf. Returns undefined for any missing branch.
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// Immutably set a dot-path on an object, cloning only the touched branch.
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  const next: Record<string, unknown> = { ...obj };
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    // i is always within bounds here (loop bound is parts.length - 1).
    const k = parts[i]!;
    const existing = cursor[k];
    const cloned: Record<string, unknown> =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[k] = cloned;
    cursor = cloned;
  }
  // parts.length >= 1 always (split always produces at least one element).
  cursor[parts[parts.length - 1]!] = value;
  return next;
}

function valuesMatch(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function toSentenceLabel(value: string): string {
  const cleaned = value
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!cleaned) return value;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function summarizeReceiptValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Empty";
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return "Empty";
    return compact.length > 92 ? `${compact.slice(0, 89)}...` : compact;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "Empty list";
    const names = value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const label = record.name || record.label || record.author || record.title || record.value;
        return typeof label === "string" && label.trim() ? label.trim() : null;
      })
      .filter(Boolean)
      .slice(0, 2);
    return `${value.length} ${value.length === 1 ? "item" : "items"}${names.length ? `: ${names.join(", ")}` : ""}`;
  }
  if (typeof value === "object") return "Updated settings";
  return String(value);
}

function buildEditReceipts({
  section,
  before,
  after,
  targets,
  status,
}: {
  section: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  targets: ReceiptTarget[];
  status: "draft" | "published";
}) {
  const sectionLabel = SECTION_LABELS[section] || toSentenceLabel(section);
  const fallbackTargets =
    targets.length > 0
      ? targets
      : Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
          .filter((key) => !key.startsWith("_"))
          .map((key) => ({ key, label: toSentenceLabel(key) }));

  return fallbackTargets
    .filter((target) => !valuesMatch(getNestedValue(before, target.key), getNestedValue(after, target.key)))
    .slice(0, 6)
    .map((target) => ({
      section,
      sectionLabel,
      field: target.key,
      fieldLabel: target.label,
      before: summarizeReceiptValue(getNestedValue(before, target.key)),
      after: summarizeReceiptValue(getNestedValue(after, target.key)),
      source: "field_editor" as const,
      status,
    }));
}

// Generic fallback field definitions. Site-model schemas can override these
// so the editor only shows fields that are rendered for the current site.
const SECTION_FIELDS: Record<string, FieldDef[]> = {
  hero: [
    { key: "headline", label: "Headline", type: "textarea", placeholder: "Main heading..." },
    { key: "subheadline", label: "Subheadline", type: "text", placeholder: "Supporting text..." },
    { key: "tagline", label: "Tagline", type: "textarea", placeholder: "Describe what you do..." },
    { key: "ctaText", label: "Button text", type: "text", placeholder: "Primary action" },
    { key: "ctaLink", label: "Button link", type: "url", placeholder: "https://..." },
  ],
  story: [
    { key: "headline", label: "Title", type: "text", placeholder: "About section title..." },
    { key: "accentText", label: "Subtitle", type: "text", placeholder: "Short accent..." },
    { key: "statement", label: "Your mission", type: "textarea", placeholder: "What drives your work..." },
    { key: "quote", label: "Featured quote", type: "textarea", placeholder: "A quote that represents you..." },
    { key: "quoteAttribution", label: "Quote by", type: "text", placeholder: "Their name" },
  ],
  contact: [
    { key: "phone", label: "Phone number", type: "tel", placeholder: "(555) 555-0000" },
    { key: "email", label: "Email", type: "email", placeholder: "hello@example.com" },
    { key: "address", label: "Address", type: "text", placeholder: "123 Main St, City, ST" },
    { key: "hours", label: "Business hours", type: "textarea", placeholder: "Mon-Fri: 9am-5pm" },
    { key: "instagramUrl", label: "Instagram", type: "url", placeholder: "https://instagram.com/..." },
    { key: "facebookUrl", label: "Facebook", type: "url", placeholder: "https://facebook.com/..." },
    { key: "googleMapsUrl", label: "Google Maps link", type: "url", placeholder: "https://maps.google.com/..." },
  ],
  settings: [
    { key: "siteName", label: "Business name", type: "text", placeholder: "Your business name" },
    { key: "ownerName", label: "Your name", type: "text", placeholder: "First name" },
    { key: "siteTagline", label: "Tagline", type: "text", placeholder: "Short tagline" },
    { key: "siteDescription", label: "Google description", type: "textarea", placeholder: "How you appear in search results..." },
    { key: "bookingUrl", label: "Booking link", type: "url", placeholder: "https://..." },
    { key: "footerTagline", label: "Footer tagline", type: "text", placeholder: "Footer text" },
    { key: "copyrightText", label: "Copyright", type: "text", placeholder: "2026 Business Name" },
    { key: "instagramHandle", label: "Instagram handle", type: "text", placeholder: "yourbusiness" },
    { key: "vagaro_embed_id", label: "Vagaro business ID", type: "text", placeholder: "yourbusiness" },
  ],
  // Array sections with top-level fields (rendered above the array editor)
  services: [
    { key: "headline", label: "Title", type: "text", placeholder: "What We Offer" },
    { key: "description", label: "Intro text", type: "textarea", placeholder: "A brief intro for visitors..." },
  ],
  faq: [
    { key: "headline", label: "Title", type: "text", placeholder: "Common Questions" },
    { key: "description", label: "Intro text", type: "textarea", placeholder: "A brief intro for visitors..." },
  ],
  shop: [
    { key: "headline", label: "Title", type: "text", placeholder: "Shop" },
    { key: "description", label: "Intro text", type: "textarea", placeholder: "A brief intro for visitors..." },
  ],
  providers: [
    { key: "headline", label: "Title", type: "text", placeholder: "My Network" },
    { key: "description", label: "Intro text", type: "textarea", placeholder: "A brief intro for visitors..." },
  ],
  testimonials: [
    { key: "headline", label: "Title", type: "text", placeholder: "What Clients Say" },
  ],
  events: [
    { key: "headline", label: "Title", type: "text", placeholder: "Upcoming Events" },
  ],
  products: [
    { key: "headline", label: "Title", type: "text", placeholder: "What We Make" },
    { key: "description", label: "Intro text", type: "textarea", placeholder: "A brief intro for visitors..." },
    { key: "bottomNote", label: "Bottom note", type: "text", placeholder: "More flavors coming soon" },
  ],
};

// Array sections use the inline editor from ARRAY_CONFIGS

export function PropertiesEditor({ activeSection }: PropertiesEditorProps) {
  const {
    triggerRefresh,
    editMode,
    setHasDraft,
    siteModel,
    liveSyncEnabled,
    dashboardHref,
    selectedNode,
    setChatPrompt,
    addEditReceipts,
    refreshKey,
  } = useDashboard();
  const dirtyRef = useRef(false);
  const prevSectionRef = useRef<string | null>(null);
  const pendingRef = useRef<{ section: string; data: Record<string, unknown> } | null>(null);
  const siteModelSchema = useMemo(() => getSiteModelSchema(siteModel), [siteModel]);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [original, setOriginal] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [tab, setTab] = useState<"edit" | "versions">("edit");

  // Reset tab when switching sections
  useEffect(() => {
    setTab("edit");
  }, [activeSection]);

  const isComposite = activeSection ? activeSection in COMPOSITE_SECTION_INFO : false;
  const fields: FieldDef[] | undefined = useMemo(
    () =>
      activeSection && !isComposite
        ? siteModelSchema?.sectionFields[activeSection] ?? SECTION_FIELDS[activeSection]
        : undefined,
    [activeSection, isComposite, siteModelSchema],
  );
  const siteModelArrays: SectionArrayConfig[] | undefined = useMemo(
    () =>
      activeSection && !isComposite
        ? siteModelSchema?.sectionArrays[activeSection]
        : undefined,
    [activeSection, isComposite, siteModelSchema],
  );
  const legacyArrayConfig = activeSection && !isComposite ? ARRAY_CONFIGS[activeSection] : undefined;
  const receiptTargets = useMemo<ReceiptTarget[]>(() => {
    const arrayTargets = siteModelArrays
      ? siteModelArrays.map((array) => ({ key: array.arrayKey, label: array.label }))
      : legacyArrayConfig
        ? [{ key: legacyArrayConfig.arrayKey, label: legacyArrayConfig.label }]
        : [];
    return [
      ...(fields ?? []).map((field) => ({ key: field.key, label: field.label })),
      ...arrayTargets,
    ];
  }, [fields, legacyArrayConfig, siteModelArrays]);

  // Load section data on section change, and re-sync when the canvas changes
  // (refreshKey) so an inline edit shows up in the inspector — without clobbering
  // an in-progress local edit.
  useEffect(() => {
    const sectionChanged = prevSectionRef.current !== activeSection;

    // Leaving a section mid-edit: flush the pending edit to the draft (fire and
    // forget) so navigating away never drops work.
    if (sectionChanged && pendingRef.current && dirtyRef.current) {
      const pending = pendingRef.current;
      pendingRef.current = null;
      dirtyRef.current = false;
      const isDraft = editMode === "draft";
      const flushUrl = isDraft
        ? dashboardHref(`/api/content/${pending.section}?draft=true`)
        : dashboardHref(`/api/content/${pending.section}`);
      fetch(flushUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(pending.data),
      })
        .then((res) => {
          if (res.ok && isDraft) setHasDraft((prev) => ({ ...prev, [pending.section]: true }));
        })
        .catch(() => {});
    }

    if (!activeSection || activeSection in COMPOSITE_SECTION_INFO) {
      setData(null);
      setOriginal(null);
      prevSectionRef.current = activeSection;
      return;
    }

    if (!sectionChanged && dirtyRef.current) return;
    prevSectionRef.current = activeSection;

    if (sectionChanged) {
      setLoading(true);
      setSaved(false);
    }
    const url = editMode === "draft"
      ? dashboardHref(`/api/content/${activeSection}?draft=true`)
      : dashboardHref(`/api/content/${activeSection}`);
    fetch(url, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        setData(d);
        setOriginal(d);
        pendingRef.current = null;
      })
      .catch(() => {
        if (sectionChanged) setData(null);
      })
      .finally(() => {
        if (sectionChanged) setLoading(false);
      });
  }, [activeSection, dashboardHref, editMode, refreshKey, setHasDraft]);

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = key.includes(".") ? setNestedValue(prev, key, value) : { ...prev, [key]: value };
      if (activeSection) pendingRef.current = { section: activeSection, data: next };
      return next;
    });
    setSaved(false);
  }, [activeSection]);

  const handleSave = useCallback(async () => {
    if (!activeSection || !data) return;
    setSaving(true);
    setSaveError(false);
    const isDraft = editMode === "draft";
    const receipts = original
      ? buildEditReceipts({
          section: activeSection,
          before: original,
          after: data,
          targets: receiptTargets,
          status: isDraft ? "draft" : "published",
        })
      : [];
    try {
      const url = isDraft
        ? dashboardHref(`/api/content/${activeSection}?draft=true`)
        : dashboardHref(`/api/content/${activeSection}`);
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        pendingRef.current = null;
        addEditReceipts(receipts);
        if (isDraft) {
          setHasDraft((prev) => ({ ...prev, [activeSection]: true }));
          setOriginal(data);
          setSaved(true);
          triggerRefresh();
          setTimeout(() => setSaved(false), 2000);
        } else {
          setOriginal(data);
          setSaved(true);
          setHasDraft((prev) => {
            const next = { ...prev };
            delete next[activeSection];
            return next;
          });
          triggerRefresh();
          setTimeout(() => setSaved(false), 2000);
        }
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 4000);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
    } finally {
      setSaving(false);
    }
  }, [activeSection, addEditReceipts, dashboardHref, data, editMode, original, receiptTargets, triggerRefresh, setHasDraft]);

  const handleReset = useCallback(() => {
    setData(original);
    setSaved(false);
  }, [original]);

  const openAskAIForSection = useCallback((section: string, label: string, fieldLabel?: string) => {
    const target = fieldLabel ? `${fieldLabel} in the ${label}` : label;
    setChatPrompt(
      `Update the ${target} section of my site. Keep the current business facts, make it more specific, and save it as a draft before anything goes live.`
    );
  }, [setChatPrompt]);

  const hasChanges = data && original && JSON.stringify(data) !== JSON.stringify(original);

  useEffect(() => {
    dirtyRef.current = !!hasChanges;
  }, [hasChanges]);

  // Auto-save: inspector edits commit to the draft on their own — same model as
  // the inline canvas editor, so there's no manual Save step and no lost work.
  useEffect(() => {
    if (!hasChanges || saving) return;
    const timer = setTimeout(() => {
      void handleSave();
    }, 600);
    return () => clearTimeout(timer);
  }, [hasChanges, saving, handleSave]);

  // No section selected
  if (!activeSection) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 px-5">
        <XaSays>Click anything in the preview to change it: words, a photo or a button. Changes save as a draft until you make them live.</XaSays>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-5" aria-busy="true">
        <StSkeleton width="40%" label="Loading this part" />
        <StSkeleton width="100%" label="Loading this part" />
        <StSkeleton width="70%" label="Loading this part" />
      </div>
    );
  }

  // Composite sections: not directly editable, point to Ask Strelva
  if (activeSection && isComposite) {
    const info = COMPOSITE_SECTION_INFO[activeSection];
    // isComposite is derived from `activeSection in COMPOSITE_SECTION_INFO`.
    if (!info) return null;
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <h3 className="m-0 text-[15px] font-medium text-[var(--st-text)]">{info.label}</h3>
        <XaSays links={[<XaTextLink key="ask" onClick={() => setChatPrompt(`${info.chatPrompt}. Keep the current business facts and save the change as a draft before anything goes live.`)}>Ask Strelva to change it</XaTextLink>]}>
          This part is filled from your {info.sources}, so it changes when they do.
        </XaSays>
      </div>
    );
  }

  if (!data) {
    return <div className="p-5"><XaSays>This part didn&apos;t load. Pick it again in the preview to retry.</XaSays></div>;
  }

  const sectionLabel = SECTION_LABELS[activeSection] || toSentenceLabel(activeSection);
  const selectClass = "min-h-[44px] w-full rounded-[var(--st-r-md)] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)]";

  return (
    <div className="flex h-full flex-col bg-[var(--st-surface)]">
      {/* The part you picked, and its history one link away */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--st-line)] px-5 py-3">
        <h3 className="m-0 min-w-0 truncate text-[15px] font-medium text-[var(--st-text)]">{sectionLabel}</h3>
        <XaTextLink onClick={() => setTab(tab === "versions" ? "edit" : "versions")}>{tab === "versions" ? "Back to editing" : "Earlier versions"}</XaTextLink>
      </div>

      {tab === "versions" ? (
        <ContentHistory
          section={activeSection}
          onRestored={() => {
            // History recovery creates a draft. Keep the live site unchanged
            // until the owner reviews it and uses the publish bar.
            setHasDraft((prev) => ({ ...prev, [activeSection]: true }));
            fetch(dashboardHref(`/api/content/${activeSection}?draft=true`), { credentials: "same-origin" })
              .then((res) => (res.ok ? res.json() : null))
              .then((d) => {
                if (d) {
                  setData(d);
                  setOriginal(d);
                }
              })
              .catch(() => {});
            triggerRefresh();
          }}
        />
      ) : (
        <>
      {/* What happened to your edit, said once, in place */}
      {hasChanges || saved || saveError ? (
        <p className="m-0 flex shrink-0 items-center gap-3 border-b border-[var(--st-line)] px-5 py-2 text-[13px]" role={saveError ? "alert" : "status"}>
          {saveError ? <><XaStatus kind="down" size="sm">Couldn&apos;t save</XaStatus><XaTextLink onClick={handleSave}>Try again</XaTextLink></>
            : hasChanges ? <><XaStatus kind="working" size="sm">Saving your change</XaStatus><XaTextLink onClick={handleReset}>Undo</XaTextLink></>
              : <XaStatus kind="live" size="sm">{editMode === "draft" ? "Draft saved - preview updated" : liveSyncEnabled ? "Saved. Your live site is refreshing." : "Saved"}</XaStatus>}
        </p>
      ) : null}

      {/* Fields */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-20 pt-5">
        {selectedNode?.section === activeSection && selectedNode.field && (
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[14px] text-[var(--st-text-2)]">
            <span>You picked <span className="font-medium text-[var(--st-text)]">{selectedNode.label || toSentenceLabel(selectedNode.field)}</span>.</span>
            <XaTextLink onClick={() => openAskAIForSection(activeSection, sectionLabel, selectedNode.label || toSentenceLabel(selectedNode.field || "selected field"))}>Ask Strelva to change it</XaTextLink>
          </p>
        )}

        {fields && fields.map((field) => (
          <div key={field.key}>
            {field.type === "image" ? (
              <ImageField label={field.label} value={getNestedValue(data, field.key)} onChange={(val) => handleFieldChange(field.key, val)} size="lg" />
            ) : field.type === "textarea" ? (
              <XaTextArea label={field.label} value={(getNestedValue(data, field.key) as string) || ""} onChange={(e) => handleFieldChange(field.key, e.target.value)} placeholder={field.placeholder} rows={3} />
            ) : field.type === "color" ? (
              (() => {
                const hex = (getNestedValue(data, field.key) as string) || "#000000";
                return (
                  <div className="flex items-center gap-3">
                    <input type="color" aria-label={field.label} value={hex} onChange={(e) => handleFieldChange(field.key, e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer rounded-full border border-[var(--st-line)] bg-transparent p-0" />
                    <span className="flex-1 text-[15px] text-[var(--st-text)]">{field.label}</span>
                    <input aria-label={`${field.label} color code`} value={hex} onChange={(e) => handleFieldChange(field.key, e.target.value)} className="w-[104px] rounded-[var(--st-r-sm)] border border-[var(--st-line)] bg-[var(--st-surface)] px-2 py-1.5 text-[14px] tabular-nums text-[var(--st-text-2)] outline-none focus-visible:border-[var(--st-accent)]" />
                  </div>
                );
              })()
            ) : field.type === "select" ? (
              (() => {
                const current = (getNestedValue(data, field.key) as string) || "";
                const opts = field.options ?? [];
                return (
                  <label className="flex flex-col gap-2">
                    <span className="text-[13px] font-medium text-[var(--st-text-body)]">{field.label}</span>
                    <select value={current} onChange={(e) => handleFieldChange(field.key, e.target.value)} className={selectClass}>
                      {current && !opts.some((o) => o.value === current) && <option value={current}>{current}</option>}
                      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                );
              })()
            ) : field.type === "number" ? (
              (() => {
                const raw = getNestedValue(data, field.key);
                const displayValue = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
                return <XaField label={field.label} type="number" value={displayValue} placeholder={field.placeholder}
                  onChange={(e) => { const v = e.target.value; handleFieldChange(field.key, v === "" ? "" : Number(v)); }} />;
              })()
            ) : (
              <XaField label={field.label} type={field.type} value={(getNestedValue(data, field.key) as string) || ""} onChange={(e) => handleFieldChange(field.key, e.target.value)} placeholder={field.placeholder} />
            )}
          </div>
        ))}

        {/* Template-declared arrays (may be multiple per section) */}
        {siteModelArrays && siteModelArrays.map((arr) => {
          if (arr.kind === "strings") {
            return (
              <StringArrayEditor
                key={arr.arrayKey}
                config={arr}
                data={data}
                onDataChange={(updated) => {
                  setData(updated);
                  setSaved(false);
                }}
              />
            );
          }
          // kind === "objects" — reuse ArrayItemEditor with an inline override
          return (
            <ArrayItemEditor
              key={arr.arrayKey}
              section={activeSection}
              configOverride={{
                sectionKey: activeSection,
                arrayKey: arr.arrayKey,
                nameKey: arr.nameKey,
                detailKey: arr.detailKey,
                label: arr.label,
                addLabel: arr.addLabel,
                fields: arr.fields,
                defaultItem: arr.defaultItem,
              }}
              data={data}
              onDataChange={(updated) => {
                setData(updated);
                setSaved(false);
              }}
            />
          );
        })}

        {/* Legacy fallback: single array config from ARRAY_CONFIGS */}
        {!siteModelArrays && legacyArrayConfig && (
          <ArrayItemEditor
            section={activeSection}
            data={data}
            onDataChange={(updated) => {
              setData(updated);
              setSaved(false);
            }}
          />
        )}

      </div>
        </>
      )}
    </div>
  );
}
