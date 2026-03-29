"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Check, RotateCcw, AlertCircle } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { ArrayItemEditor } from "./ArrayItemEditor";
import { ARRAY_CONFIGS } from "./arrayFieldConfigs";

interface PropertiesEditorProps {
  activeSection: string | null;
}

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "url" | "email" | "tel";
  placeholder?: string;
}

// Field definitions per section — only simple top-level fields (not arrays)
const SECTION_FIELDS: Record<string, FieldDef[]> = {
  hero: [
    { key: "headline", label: "Headline", type: "textarea", placeholder: "Main heading..." },
    { key: "subheadline", label: "Subheadline", type: "text", placeholder: "Supporting text..." },
    { key: "tagline", label: "Tagline", type: "textarea", placeholder: "Brand tagline..." },
    { key: "ctaText", label: "CTA Text", type: "text", placeholder: "Book a Session" },
    { key: "ctaLink", label: "CTA Link", type: "url", placeholder: "https://..." },
  ],
  story: [
    { key: "headline", label: "Headline", type: "text", placeholder: "About section title..." },
    { key: "accentText", label: "Accent Text", type: "text", placeholder: "Short accent..." },
    { key: "statement", label: "Statement", type: "textarea", placeholder: "Mission statement..." },
    { key: "quote", label: "Quote", type: "textarea", placeholder: "Pull quote..." },
    { key: "quoteAttribution", label: "Quote Attribution", type: "text", placeholder: "— Name" },
  ],
  contact: [
    { key: "phone", label: "Phone", type: "tel", placeholder: "(716) 555-0000" },
    { key: "email", label: "Email", type: "email", placeholder: "hello@example.com" },
    { key: "address", label: "Address", type: "text", placeholder: "123 Main St, City, ST" },
    { key: "hours", label: "Hours", type: "textarea", placeholder: "Mon-Fri: 9am-5pm" },
    { key: "instagramUrl", label: "Instagram", type: "url", placeholder: "https://instagram.com/..." },
    { key: "facebookUrl", label: "Facebook", type: "url", placeholder: "https://facebook.com/..." },
    { key: "googleMapsUrl", label: "Google Maps", type: "url", placeholder: "https://maps.google.com/..." },
  ],
  settings: [
    { key: "siteName", label: "Site Name", type: "text", placeholder: "Business name" },
    { key: "ownerName", label: "Owner Name", type: "text", placeholder: "Your name" },
    { key: "siteTagline", label: "Tagline", type: "text", placeholder: "Short tagline" },
    { key: "siteDescription", label: "SEO Description", type: "textarea", placeholder: "Description for Google..." },
    { key: "bookingUrl", label: "Booking URL", type: "url", placeholder: "https://..." },
    { key: "footerTagline", label: "Footer Tagline", type: "text", placeholder: "Footer text" },
    { key: "copyrightText", label: "Copyright", type: "text", placeholder: "2026 Business Name" },
    { key: "instagramHandle", label: "Instagram Handle", type: "text", placeholder: "rohlaxwellness" },
    { key: "vagaro_embed_id", label: "Vagaro Business ID", type: "text", placeholder: "rohlaxwellness" },
  ],
  // Array sections with top-level fields (rendered above the array editor)
  services: [
    { key: "headline", label: "Section Headline", type: "text", placeholder: "What We Offer" },
    { key: "description", label: "Description", type: "textarea", placeholder: "Section description..." },
  ],
  faq: [
    { key: "headline", label: "Section Headline", type: "text", placeholder: "Common Questions" },
    { key: "description", label: "Description", type: "textarea", placeholder: "Section description..." },
  ],
  shop: [
    { key: "headline", label: "Section Headline", type: "text", placeholder: "Shop" },
    { key: "description", label: "Description", type: "textarea", placeholder: "Section description..." },
  ],
  providers: [
    { key: "headline", label: "Section Headline", type: "text", placeholder: "Wellness Network" },
    { key: "description", label: "Description", type: "textarea", placeholder: "Section description..." },
  ],
  testimonials: [
    { key: "headline", label: "Section Headline", type: "text", placeholder: "What Clients Say" },
  ],
  events: [
    { key: "headline", label: "Section Headline", type: "text", placeholder: "Upcoming Events" },
  ],
};

// Array sections use the inline editor from ARRAY_CONFIGS

export function PropertiesEditor({ activeSection }: PropertiesEditorProps) {
  const { triggerRefresh, editMode, hasDraft, setHasDraft } = useDashboard();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [original, setOriginal] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Fetch section data when activeSection changes
  useEffect(() => {
    if (!activeSection) {
      setData(null);
      setOriginal(null);
      return;
    }

    setLoading(true);
    setSaved(false);
    fetch(`/api/content/${activeSection}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        setData(d);
        setOriginal(d);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeSection]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeSection || !data) return;
    setSaving(true);
    setSaveError(false);
    const isDraft = editMode === "draft";
    try {
      const url = isDraft
        ? `/api/content/${activeSection}?draft=true`
        : `/api/content/${activeSection}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        if (isDraft) {
          setHasDraft((prev) => ({ ...prev, [activeSection]: true }));
          setSaved(true);
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
  }, [activeSection, data, editMode, triggerRefresh, setHasDraft]);

  const handlePublish = useCallback(async () => {
    if (!activeSection || !data) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch(`/api/content/${activeSection}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setOriginal(data);
        setSaved(true);
        setHasDraft((prev) => {
          const next = { ...prev };
          delete next[activeSection];
          return next;
        });
        triggerRefresh();
        setTimeout(() => setSaved(false), 2000);
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
  }, [activeSection, data, triggerRefresh, setHasDraft]);

  const handleReset = useCallback(() => {
    setData(original);
    setSaved(false);
  }, [original]);

  const hasChanges = data && original && JSON.stringify(data) !== JSON.stringify(original);

  // No section selected
  if (!activeSection) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-10 h-10 rounded-lg bg-[#f5f5f5] flex items-center justify-center mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
          </svg>
        </div>
        <p className="text-[12px] text-[#999]">Select a section to edit</p>
        <p className="text-[11px] text-[#ccc] mt-1">Click any section in the left panel</p>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-4 h-4 text-[#999] animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center">
        <p className="text-[12px] text-[#999]">Could not load section data</p>
      </div>
    );
  }

  const fields = SECTION_FIELDS[activeSection];
  const arrayConfig = ARRAY_CONFIGS[activeSection];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Save bar */}
      {hasChanges && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#e8e8e8] bg-[#fafafa] shrink-0 animate-fade-in-up">
          <span className="text-[11px] text-[#999]">Unsaved changes</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium text-white bg-[#7c9a8e] hover:bg-[#5a7a6e] disabled:opacity-50 transition-colors duration-150"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <Save className="w-3 h-3" strokeWidth={1.5} />
              )}
              {editMode === "draft" ? "Save Draft" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Publish bar — shown in draft mode when a draft exists */}
      {editMode === "draft" && activeSection && hasDraft[activeSection] && !hasChanges && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#e8e8e8] bg-amber-500/[0.04] shrink-0 animate-fade-in-up">
          <span className="text-[11px] text-amber-700">Draft saved — not yet live</span>
          <button
            onClick={handlePublish}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium text-white bg-[#7c9a8e] hover:bg-[#5a7a6e] disabled:opacity-50 transition-colors duration-150"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : null}
            Publish
          </button>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8e8e8] bg-emerald-500/[0.04] shrink-0">
          <Check className="w-3 h-3 text-emerald-600" strokeWidth={1.5} />
          <span className="text-[11px] text-emerald-700">Saved — preview updated</span>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#e8e8e8] bg-red-500/[0.04] shrink-0 animate-fade-in-up">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3 h-3 text-red-500" strokeWidth={1.5} />
            <span className="text-[11px] text-red-600">Couldn&apos;t save — try again</span>
          </div>
          <button
            onClick={handleSave}
            className="text-[10px] font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Fields */}
      <div className="flex-1 overflow-y-auto">
        {/* Simple fields */}
        {fields && fields.map((field) => (
          <div key={field.key} className="px-4 py-3 border-b border-[#f5f5f5]">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-[#999] mb-1.5">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                value={(data[field.key] as string) || ""}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full bg-[#fafafa] border border-[#e8e8e8] rounded-md px-3 py-2 text-[12px] text-[#1a1a1a] placeholder-[#ccc] outline-none focus:border-[#7c9a8e] focus:ring-1 focus:ring-[#7c9a8e]/20 transition-all duration-150 resize-none"
              />
            ) : (
              <input
                type={field.type}
                value={(data[field.key] as string) || ""}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full bg-[#fafafa] border border-[#e8e8e8] rounded-md px-3 py-2 text-[12px] text-[#1a1a1a] placeholder-[#ccc] outline-none focus:border-[#7c9a8e] focus:ring-1 focus:ring-[#7c9a8e]/20 transition-all duration-150"
              />
            )}
          </div>
        ))}

        {/* Array sections — inline item editor */}
        {arrayConfig && (
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
    </div>
  );
}
