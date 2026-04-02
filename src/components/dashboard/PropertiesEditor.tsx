"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Check, RotateCcw, AlertCircle, MessageCircle } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { ArrayItemEditor } from "./ArrayItemEditor";
import { ARRAY_CONFIGS } from "./arrayFieldConfigs";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import { TextInput, TextArea } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLine } from "@/components/ui/Skeleton";

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
    { key: "tagline", label: "Tagline", type: "textarea", placeholder: "Describe what you do..." },
    { key: "ctaText", label: "Button text", type: "text", placeholder: "Book a Session" },
    { key: "ctaLink", label: "Button link", type: "url", placeholder: "https://..." },
  ],
  story: [
    { key: "headline", label: "Title", type: "text", placeholder: "About section title..." },
    { key: "accentText", label: "Subtitle", type: "text", placeholder: "Short accent..." },
    { key: "statement", label: "Your mission", type: "textarea", placeholder: "What drives your work..." },
    { key: "quote", label: "Featured quote", type: "textarea", placeholder: "A quote that represents you..." },
    { key: "quoteAttribution", label: "Quote by", type: "text", placeholder: "— Name" },
  ],
  contact: [
    { key: "phone", label: "Phone number", type: "tel", placeholder: "(716) 555-0000" },
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
    { key: "instagramHandle", label: "Instagram handle", type: "text", placeholder: "rohlaxwellness" },
    { key: "vagaro_embed_id", label: "Vagaro business ID", type: "text", placeholder: "rohlaxwellness" },
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
    { key: "headline", label: "Title", type: "text", placeholder: "Wellness Network" },
    { key: "description", label: "Intro text", type: "textarea", placeholder: "A brief intro for visitors..." },
  ],
  testimonials: [
    { key: "headline", label: "Title", type: "text", placeholder: "What Clients Say" },
  ],
  events: [
    { key: "headline", label: "Title", type: "text", placeholder: "Upcoming Events" },
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

  const isComposite = activeSection ? activeSection in COMPOSITE_SECTION_INFO : false;

  // Fetch section data when activeSection changes (skip composites)
  useEffect(() => {
    if (!activeSection || activeSection in COMPOSITE_SECTION_INFO) {
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
      <EmptyState
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
          </svg>
        }
        title="Select a section to edit"
        description="Click any section in the left panel"
        className="h-full"
      />
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <SkeletonLine width="w-1/3" height="h-4" />
        <SkeletonLine width="w-full" height="h-8" />
        <SkeletonLine width="w-full" height="h-8" />
        <SkeletonLine width="w-2/3" height="h-8" />
      </div>
    );
  }

  // Composite sections — not directly editable, point to chat
  if (activeSection && isComposite) {
    const info = COMPOSITE_SECTION_INFO[activeSection];
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="px-4 py-2.5 border-b border-gray-border bg-gray-bg-alt shrink-0">
          <span className="text-[11px] uppercase tracking-wider text-gray-muted">Viewing</span>
          <h3 className="text-[13px] font-medium text-warm-black mt-0.5">{info.label}</h3>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
          <div className="w-10 h-10 rounded-lg bg-sage/[0.08] flex items-center justify-center mb-3">
            <MessageCircle className="w-[18px] h-[18px] text-sage" strokeWidth={1.5} />
          </div>
          <p className="text-[12px] text-gray-fg mb-1">This section pulls from <span className="font-medium">{info.sources}</span></p>
          <p className="text-[11px] text-gray-muted mb-4">Use AI Chat to make changes</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center">
        <p className="text-[12px] text-gray-muted">Could not load section data</p>
      </div>
    );
  }

  const fields = SECTION_FIELDS[activeSection];
  const arrayConfig = ARRAY_CONFIGS[activeSection];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Section header */}
      <div className="px-4 py-3 border-b border-gray-border bg-white shrink-0">
        <h3 className="text-[14px] font-semibold text-warm-black">
          {SECTION_LABELS[activeSection] || activeSection}
        </h3>
      </div>

      {/* Save bar */}
      {hasChanges && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-border bg-gray-bg-alt shrink-0 animate-fade-in-up">
          <span className="text-[11px] text-gray-muted">Unsaved changes</span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="w-3 h-3" strokeWidth={1.5} />}
              onClick={handleReset}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              icon={!saving ? <Save className="w-3 h-3" strokeWidth={1.5} /> : undefined}
              onClick={handleSave}
            >
              {editMode === "draft" ? "Save Draft" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* Publish bar — shown in draft mode when a draft exists */}
      {editMode === "draft" && activeSection && hasDraft[activeSection] && !hasChanges && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-border bg-amber-500/[0.04] shrink-0 animate-fade-in-up">
          <span className="text-[11px] text-amber-700">Draft saved — not yet live</span>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={handlePublish}
          >
            Publish
          </Button>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-border bg-emerald-500/[0.04] shrink-0">
          <Check className="w-3 h-3 text-emerald-600" strokeWidth={1.5} />
          <span className="text-[11px] text-emerald-700">Saved — preview updated</span>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-border bg-red-500/[0.04] shrink-0 animate-fade-in-up">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3 h-3 text-red-500" strokeWidth={1.5} />
            <span className="text-[11px] text-red-600">Couldn&apos;t save — try again</span>
          </div>
          <button
            onClick={handleSave}
            className="text-[11px] font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Fields */}
      <div className="flex-1 overflow-y-auto pb-20">
        {/* Simple fields */}
        {fields && fields.map((field) => (
          <div key={field.key} className="px-4 py-2">
            {field.type === "textarea" ? (
              <TextArea
                label={field.label}
                value={(data[field.key] as string) || ""}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={2}
              />
            ) : (
              <TextInput
                label={field.label}
                type={field.type}
                value={(data[field.key] as string) || ""}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
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
