"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Check, Bot } from "lucide-react";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { Tabs } from "@/components/ui/Tabs";
import { TextInput, TextArea } from "@/components/ui/TextInput";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { DomainsClient } from "./DomainsClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsData = Record<string, string>;
type ThemeData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Identity field definitions
// ---------------------------------------------------------------------------

const IDENTITY_FIELDS: readonly {
  key: string;
  label: string;
  description: string;
  multiline?: boolean;
}[] = [
  { key: "siteName", label: "Site Name", description: "Your business name" },
  { key: "ownerName", label: "Owner Name", description: "Shown in greetings and AI interactions" },
  { key: "siteTagline", label: "Tagline", description: "Appears in search results and header" },
  { key: "siteDescription", label: "Description", description: "SEO description for Google", multiline: true },
  { key: "bookingUrl", label: "Booking URL", description: "Where clients book sessions" },
  { key: "footerTagline", label: "Footer Tagline", description: "Shown at the bottom of your site" },
  { key: "copyrightText", label: "Copyright", description: "Legal text in footer" },
];

// ---------------------------------------------------------------------------
// Theme field definitions (matches food-brand schema — universal token names)
// ---------------------------------------------------------------------------

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "Fraunces", label: "Fraunces" },
  { value: "Instrument_Serif", label: "Instrument Serif" },
  { value: "Playfair_Display", label: "Playfair Display" },
  { value: "DM_Serif_Display", label: "DM Serif Display" },
  { value: "Inter", label: "Inter" },
  { value: "DM_Sans", label: "DM Sans" },
  { value: "Manrope", label: "Manrope" },
  { value: "Work_Sans", label: "Work Sans" },
];

const THEME_FONT_FIELDS: { key: string; label: string }[] = [
  { key: "fontDisplay", label: "Display font" },
  { key: "fontBody", label: "Body font" },
];

const THEME_COLOR_FIELDS: { key: string; label: string }[] = [
  { key: "colors.cream", label: "Cream" },
  { key: "colors.creamDark", label: "Cream Dark" },
  { key: "colors.creamMid", label: "Cream Mid" },
  { key: "colors.sage", label: "Sage" },
  { key: "colors.sageLight", label: "Sage Light" },
  { key: "colors.sageDark", label: "Sage Dark" },
  { key: "colors.bark", label: "Bark" },
  { key: "colors.barkLight", label: "Bark Light" },
  { key: "colors.barkFaded", label: "Bark Faded" },
  { key: "colors.wheat", label: "Wheat" },
  { key: "colors.wheatLight", label: "Wheat Light" },
  { key: "colors.terra", label: "Terra" },
  { key: "colors.terraLight", label: "Terra Light" },
];

// ---------------------------------------------------------------------------
// Nested value helpers (copied from PropertiesEditor)
// ---------------------------------------------------------------------------

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

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  const next: Record<string, unknown> = { ...obj };
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const existing = cursor[k];
    const cloned: Record<string, unknown> =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[k] = cloned;
    cursor = cloned;
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { value: "identity", label: "Identity" },
  { value: "brand", label: "Brand" },
  { value: "myai", label: "My AI" },
  { value: "domains", label: "Domains" },
  { value: "publishing", label: "Publishing" },
];

// ---------------------------------------------------------------------------
// Saved toast component
// ---------------------------------------------------------------------------

function SavedToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-toast">
      <div className="bg-surface border border-gray-border rounded-lg px-4 py-2 flex items-center gap-1.5 text-xs font-mono text-emerald-600 shadow-lg">
        <Check className="w-3 h-3" strokeWidth={1.5} />
        Saved
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity Tab
// ---------------------------------------------------------------------------

function IdentityTab({
  settings,
  setSettings,
}: {
  settings: SettingsData;
  setSettings: (s: SettingsData) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latestRef = useRef(settings);
  latestRef.current = settings;

  const saveSettings = useCallback(async (data: SettingsData) => {
    setSaveError(false);
    try {
      const res = await fetch("/api/content/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 3000);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
  }, []);

  const handleChange = useCallback(
    (key: string, value: string) => {
      const updated = { ...latestRef.current, [key]: value };
      setSettings(updated);
      latestRef.current = updated;
    },
    [setSettings],
  );

  const handleBlurSave = useCallback(() => {
    saveSettings(latestRef.current);
  }, [saveSettings]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
        saveSettings(latestRef.current);
      }
    },
    [saveSettings],
  );

  return (
    <div>
      {saveError && (
        <div className="mb-4 px-4 py-2.5 rounded-md bg-red-600/5 border border-red-200 text-xs text-red-600">
          Couldn&apos;t save — try again
        </div>
      )}

      <div className="bg-surface rounded-2xl overflow-hidden">
        {IDENTITY_FIELDS.map((field, i) => (
          <div
            key={field.key}
            className={`px-5 py-4 ${
              i < IDENTITY_FIELDS.length - 1 ? "border-b border-gray-bg" : ""
            }`}
          >
            {field.multiline ? (
              <TextArea
                label={field.label}
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                onBlur={handleBlurSave}
                onKeyDown={handleKeyDown}
                placeholder={field.description}
                rows={2}
              />
            ) : (
              <TextInput
                label={field.label}
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                onBlur={handleBlurSave}
                onKeyDown={handleKeyDown}
                placeholder={field.description}
              />
            )}
          </div>
        ))}
      </div>

      <SavedToast visible={saved} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand Tab
// ---------------------------------------------------------------------------

function BrandTab() {
  const [theme, setTheme] = useState<ThemeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latestRef = useRef<ThemeData | null>(null);

  useEffect(() => {
    fetch("/api/content/theme", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setTheme(data);
        latestRef.current = data;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveTheme = useCallback(async (data: ThemeData) => {
    setSaveError(false);
    try {
      const res = await fetch("/api/content/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 3000);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
  }, []);

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      setTheme((prev) => {
        if (!prev) return prev;
        const updated = key.includes(".")
          ? setNestedValue(prev, key, value)
          : { ...prev, [key]: value };
        latestRef.current = updated;
        return updated;
      });
    },
    [],
  );

  const handleBlurSave = useCallback(() => {
    if (latestRef.current) saveTheme(latestRef.current);
  }, [saveTheme]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonLine width="w-1/3" height="h-4" />
        <SkeletonLine width="w-full" height="h-8" />
        <SkeletonLine width="w-full" height="h-8" />
        <SkeletonLine width="w-2/3" height="h-8" />
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="bg-red-600/5 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-sm text-red-600">Couldn&apos;t load theme data</p>
      </div>
    );
  }

  return (
    <div>
      {saveError && (
        <div className="mb-4 px-4 py-2.5 rounded-md bg-red-600/5 border border-red-200 text-xs text-red-600">
          Couldn&apos;t save — try again
        </div>
      )}

      {/* Font pickers */}
      <div className="bg-surface rounded-2xl overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-gray-bg">
          <span className="text-xs font-medium text-warm-black">Typography</span>
        </div>
        {THEME_FONT_FIELDS.map((field, i) => {
          const current = (getNestedValue(theme, field.key) as string) || "";
          return (
            <div
              key={field.key}
              className={`px-5 py-4 ${
                i < THEME_FONT_FIELDS.length - 1 ? "border-b border-gray-bg" : ""
              }`}
            >
              <label className="block text-[11px] text-gray-muted mb-1">
                {field.label}
              </label>
              <select
                value={current}
                onChange={(e) => {
                  handleFieldChange(field.key, e.target.value);
                  // Save immediately on select change
                  const updated = { ...latestRef.current!, [field.key]: e.target.value };
                  latestRef.current = updated;
                  setTheme(updated);
                  saveTheme(updated);
                }}
                className="w-full h-9 px-3 text-[13px] rounded-md border border-gray-border bg-surface text-warm-black outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-all duration-150"
              >
                {current && !FONT_OPTIONS.some((o) => o.value === current) && (
                  <option value={current}>{current}</option>
                )}
                {FONT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Color pickers */}
      <div className="bg-surface rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-bg">
          <span className="text-xs font-medium text-warm-black">Colors</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
          {THEME_COLOR_FIELDS.map((field, i) => {
            const hex = (getNestedValue(theme, field.key) as string) || "#000000";
            return (
              <div
                key={field.key}
                className={`px-5 py-3 ${
                  i < THEME_COLOR_FIELDS.length - 1 ? "border-b border-gray-bg" : ""
                } ${i % 2 === 0 ? "sm:border-r sm:border-r-gray-bg" : ""}`}
              >
                <label className="block text-[11px] text-gray-muted mb-1.5">
                  {field.label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    onBlur={handleBlurSave}
                    className="h-8 w-10 rounded border border-gray-border bg-surface p-0.5 cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={hex}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    onBlur={handleBlurSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLElement).blur();
                      }
                    }}
                    placeholder="#000000"
                    className="w-24 h-8 px-2 text-[12px] rounded border border-gray-border bg-surface text-warm-black font-mono outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-all duration-150"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SavedToast visible={saved} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domains Tab
// ---------------------------------------------------------------------------

function DomainsTab() {
  return (
    <div className="-mx-5 -mt-2 sm:-mx-0 sm:mt-0">
      <DomainsClient initialDomains={[]} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publishing Tab
// ---------------------------------------------------------------------------

function PublishingTab() {
  const dashboard = useDashboardOptional();

  return (
    <div>
      <div className="bg-surface rounded-2xl overflow-hidden">
        <div className="flex items-start sm:items-center justify-between gap-4 px-5 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-warm-black">
                Auto-publish
              </span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                  dashboard?.autoPublish
                    ? "text-emerald-600/80 bg-emerald-500/10"
                    : "text-amber-600/80 bg-amber-500/10"
                }`}
              >
                {dashboard?.autoPublish ? "on" : "off"}
              </span>
            </div>
            <p className="text-xs text-gray-subtle">
              {dashboard?.autoPublish
                ? "AI changes go live immediately when you confirm them in chat."
                : "AI changes are saved as drafts for admin review before going live."}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 bg-surface rounded-2xl overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="text-sm font-medium text-warm-black mb-2">How it works</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </span>
              <div>
                <p className="text-xs font-medium text-warm-black">Live mode</p>
                <p className="text-xs text-gray-subtle">
                  When you confirm an AI suggestion in chat, the change is published to your live site immediately.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              </span>
              <div>
                <p className="text-xs font-medium text-warm-black">Draft mode</p>
                <p className="text-xs text-gray-subtle">
                  AI changes are saved as drafts. An admin reviews and publishes them before they go live. Good for businesses that need approval workflows.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// My AI Tab
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_SCHEDULE = DAY_LABELS.map((_, i) => ({
  day: i,
  open: "09:00",
  close: "17:00",
  closed: i === 0, // Sunday closed by default
}));

interface AISettings {
  businessRules: string;
  personality: string;
  businessHours: {
    schedule: { day: number; open: string; close: string; closed: boolean }[];
    holidays?: { date: string; label: string }[];
    timezone?: string;
  } | null;
}

function MyAITab() {
  const [data, setData] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latestRef = useRef<AISettings | null>(null);

  useEffect(() => {
    fetch("/api/tenant-settings", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        const settings: AISettings = {
          businessRules: d?.businessRules || "",
          personality: d?.personality || "",
          businessHours: d?.businessHours || { schedule: DEFAULT_SCHEDULE, holidays: [] },
        };
        setData(settings);
        latestRef.current = settings;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (settings: AISettings) => {
    setSaveError(false);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 3000);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
  }, []);

  const handleBlurSave = useCallback(() => {
    if (latestRef.current) save(latestRef.current);
  }, [save]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonLine width="w-1/3" height="h-4" />
        <SkeletonLine width="w-full" height="h-20" />
        <SkeletonLine width="w-full" height="h-20" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-red-600/5 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-sm text-red-600">Couldn&apos;t load AI settings</p>
      </div>
    );
  }

  const schedule = data.businessHours?.schedule || DEFAULT_SCHEDULE;

  return (
    <div>
      {saveError && (
        <div className="mb-4 px-4 py-2.5 rounded-md bg-red-600/5 border border-red-200 text-xs text-red-600">
          Couldn&apos;t save — try again
        </div>
      )}

      {/* Personality */}
      <div className="bg-surface rounded-2xl overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-gray-bg flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
          <span className="text-xs font-medium text-warm-black">Voice & Personality</span>
        </div>
        <div className="px-5 py-4">
          <TextInput
            label="AI personality"
            value={data.personality}
            onChange={(e) => {
              const updated = { ...data, personality: e.target.value };
              setData(updated);
              latestRef.current = updated;
            }}
            onBlur={handleBlurSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLElement).blur();
              }
            }}
            placeholder="e.g. warm and casual, professional, friendly but concise"
          />
          <p className="text-[11px] text-gray-subtle mt-1.5">
            Describes how the AI sounds in chat, emails, social posts, and review replies.
          </p>
        </div>
      </div>

      {/* Business Rules */}
      <div className="bg-surface rounded-2xl overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-gray-bg">
          <span className="text-xs font-medium text-warm-black">Instructions for the AI</span>
        </div>
        <div className="px-5 py-4">
          <TextArea
            label="Business rules"
            value={data.businessRules}
            onChange={(e) => {
              const updated = { ...data, businessRules: e.target.value };
              setData(updated);
              latestRef.current = updated;
            }}
            onBlur={handleBlurSave}
            placeholder={"e.g.\n• Always mention we're woman-owned\n• Never discount below 15%\n• Don't change the hero image without asking\n• When responding to reviews, always thank them by name"}
            rows={6}
          />
          <p className="text-[11px] text-gray-subtle mt-1.5">
            Persistent instructions the AI follows on every interaction — chat, emails, social posts, review replies. 2,000 characters max.
          </p>
        </div>
      </div>

      {/* Business Hours */}
      <div className="bg-surface rounded-2xl overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-gray-bg">
          <span className="text-xs font-medium text-warm-black">Business Hours</span>
        </div>
        <div className="divide-y divide-gray-bg">
          {schedule.map((day, i) => (
            <div key={day.day} className="flex items-center gap-3 px-5 py-3">
              <span className="text-[13px] text-warm-black w-24 shrink-0">
                {DAY_LABELS[day.day]}
              </span>
              <label className="flex items-center gap-1.5 shrink-0">
                <input
                  type="checkbox"
                  checked={!day.closed}
                  onChange={(e) => {
                    const newSchedule = [...schedule];
                    newSchedule[i] = { ...day, closed: !e.target.checked };
                    const updated = {
                      ...data,
                      businessHours: { ...data.businessHours!, schedule: newSchedule },
                    };
                    setData(updated);
                    latestRef.current = updated;
                    save(updated);
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-border text-sage focus:ring-sage/20"
                />
                <span className="text-[11px] text-gray-muted">Open</span>
              </label>
              {!day.closed ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="time"
                    value={day.open}
                    onChange={(e) => {
                      const newSchedule = [...schedule];
                      newSchedule[i] = { ...day, open: e.target.value };
                      const updated = {
                        ...data,
                        businessHours: { ...data.businessHours!, schedule: newSchedule },
                      };
                      setData(updated);
                      latestRef.current = updated;
                    }}
                    onBlur={handleBlurSave}
                    className="w-[110px] h-8 px-2 text-[12px] rounded border border-gray-border bg-surface text-warm-black font-mono outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-all duration-150"
                  />
                  <span className="text-[11px] text-gray-subtle">to</span>
                  <input
                    type="time"
                    value={day.close}
                    onChange={(e) => {
                      const newSchedule = [...schedule];
                      newSchedule[i] = { ...day, close: e.target.value };
                      const updated = {
                        ...data,
                        businessHours: { ...data.businessHours!, schedule: newSchedule },
                      };
                      setData(updated);
                      latestRef.current = updated;
                    }}
                    onBlur={handleBlurSave}
                    className="w-[110px] h-8 px-2 text-[12px] rounded border border-gray-border bg-surface text-warm-black font-mono outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-all duration-150"
                  />
                </div>
              ) : (
                <span className="text-[12px] text-gray-subtle italic">Closed</span>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-bg">
          <p className="text-[11px] text-gray-subtle">
            The AI uses these hours to answer &quot;are you open?&quot; questions and to update your site&apos;s hours section.
          </p>
        </div>
      </div>

      <SavedToast visible={saved} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const dashboard = useDashboardOptional();

  const [activeTab, setActiveTab] = useState("identity");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/content/settings", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => setSettings(data))
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <div className="p-6 md:p-8 lg:p-10 w-full max-w-4xl mx-auto h-full overflow-y-auto">
        <div className="bg-red-600/5 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-sm text-red-600 mb-3">Couldn&apos;t load settings</p>
          <button
            onClick={() => {
              setLoadError(false);
              setSettings(null);
              fetch("/api/content/settings", { credentials: "same-origin" })
                .then((res) => {
                  if (!res.ok) throw new Error();
                  return res.json();
                })
                .then((data) => setSettings(data))
                .catch(() => setLoadError(true));
            }}
            className="px-4 py-2 rounded-md bg-surface border border-gray-border text-xs text-gray-fg hover:bg-gray-bg transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!settings && activeTab === "identity") {
    return (
      <div className="p-6 md:p-8 lg:p-10 w-full max-w-4xl mx-auto h-full overflow-y-auto animate-pulse">
        <div className="mb-8">
          <div className="h-3 w-16 bg-gray-bg-hover rounded mb-2" />
          <div className="h-7 w-40 bg-gray-bg-hover rounded" />
        </div>
        <div className="bg-surface rounded-2xl">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-5 py-5 border-b border-gray-bg last:border-0">
              <div className="h-3 w-24 bg-gray-bg-hover rounded mb-2" />
              <div className="h-4 w-48 bg-gray-bg rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-4xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-medium tracking-tight text-warm-black">
          Settings
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-border mb-6 -mx-6 md:-mx-8 px-6 md:px-8">
        <Tabs
          items={TABS}
          value={activeTab}
          onChange={setActiveTab}
          variant="underline"
          className="h-10"
        />
      </div>

      {/* Tab content */}
      {activeTab === "identity" && settings && (
        <IdentityTab settings={settings} setSettings={setSettings} />
      )}
      {activeTab === "brand" && <BrandTab />}
      {activeTab === "myai" && <MyAITab />}
      {activeTab === "domains" && <DomainsTab />}
      {activeTab === "publishing" && <PublishingTab />}
    </div>
  );
}
