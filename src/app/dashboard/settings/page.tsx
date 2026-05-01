"use client";

import { useEffect, useState, useRef, useCallback } from "react";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { DomainsClient } from "./DomainsClient";
import { DashSelect, FormRow, SavedToast } from "@/components/dashboard/ui";

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
  mono?: boolean;
}[] = [
  { key: "siteName", label: "Site Name", description: "Your business name" },
  { key: "ownerName", label: "Owner Name", description: "Shown in greetings" },
  { key: "siteTagline", label: "Tagline", description: "Search results & header" },
  { key: "siteDescription", label: "Description", description: "SEO description", multiline: true },
  { key: "bookingUrl", label: "Booking URL", description: "Where clients book", mono: true },
  { key: "footerTagline", label: "Footer Tagline", description: "Bottom of your site" },
  { key: "copyrightText", label: "Copyright", description: "Legal text in footer" },
];

// ---------------------------------------------------------------------------
// Theme fields
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
  { key: "colors.cream", label: "Background" },
  { key: "colors.sage", label: "Primary" },
  { key: "colors.bark", label: "Text" },
  { key: "colors.terra", label: "Accent" },
  { key: "colors.wheat", label: "Secondary" },
];

// ---------------------------------------------------------------------------
// Nested value helpers
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
// Settings nav items
// ---------------------------------------------------------------------------

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "brand", label: "Brand" },
  { id: "ai", label: "AI Agent" },
  { id: "domains", label: "Domains" },
  { id: "billing", label: "Plan & Billing" },
  { id: "divider", label: "" },
  { id: "publishing", label: "Publishing" },
] as const;

// ---------------------------------------------------------------------------
// Profile section
// ---------------------------------------------------------------------------

function ProfileSection({
  settings,
  setSettings,
}: {
  settings: SettingsData;
  setSettings: (s: SettingsData) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latestRef = useRef(settings);
  useEffect(() => {
    latestRef.current = settings;
  });

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

  return (
    <>
      {saveError && (
        <div className="mb-4 px-4 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          Couldn&apos;t save — try again
        </div>
      )}

      <div className="rounded-lg border border-gray-border overflow-hidden">
        {IDENTITY_FIELDS.map((field, i) => (
          <FormRow
            key={field.key}
            label={field.label}
            description={field.description}
            last={i === IDENTITY_FIELDS.length - 1}
          >
            {field.multiline ? (
              <textarea
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                onBlur={handleBlurSave}
                rows={2}
                className="w-full bg-surface-base border border-gray-border rounded-md px-3 py-2 text-[13px] text-warm-white outline-none resize-none focus:border-accent/40 transition-colors"
              />
            ) : (
              <input
                type="text"
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                onBlur={handleBlurSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLElement).blur();
                }}
                className={`w-full bg-surface-base border border-gray-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-accent/40 transition-colors ${
                  field.mono
                    ? "font-mono text-accent text-[12px]"
                    : "text-warm-white"
                }`}
              />
            )}
          </FormRow>
        ))}
      </div>

      <SavedToast visible={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Brand section
// ---------------------------------------------------------------------------

function BrandSection() {
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
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
        <p className="text-sm text-red-400">Couldn&apos;t load theme data</p>
      </div>
    );
  }

  return (
    <>
      {saveError && (
        <div className="mb-4 px-4 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          Couldn&apos;t save — try again
        </div>
      )}

      {/* Fonts */}
      <div className="rounded-lg border border-gray-border overflow-hidden mb-6">
        {THEME_FONT_FIELDS.map((field, i) => {
          const current = (getNestedValue(theme, field.key) as string) || "";
          return (
            <FormRow
              key={field.key}
              label={field.label}
              description="Font family"
              last={i === THEME_FONT_FIELDS.length - 1}
            >
              <DashSelect
                value={current}
                onChange={(e) => {
                  handleFieldChange(field.key, e.target.value);
                  const updated = { ...latestRef.current!, [field.key]: e.target.value };
                  latestRef.current = updated;
                  setTheme(updated);
                  saveTheme(updated);
                }}
                options={[
                  ...(current && !FONT_OPTIONS.some((o) => o.value === current)
                    ? [{ value: current, label: current }]
                    : []),
                  ...FONT_OPTIONS,
                ]}
              />
            </FormRow>
          );
        })}
      </div>

      {/* Colors */}
      <div className="rounded-lg border border-gray-border overflow-hidden">
        {THEME_COLOR_FIELDS.map((field, i) => {
          const hex = (getNestedValue(theme, field.key) as string) || "#000000";
          return (
            <FormRow
              key={field.key}
              label={field.label}
              description="Color value"
              last={i === THEME_COLOR_FIELDS.length - 1}
            >
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  onBlur={handleBlurSave}
                  className="h-8 w-8 rounded-md border border-gray-border bg-surface-base p-0.5 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={hex}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  onBlur={handleBlurSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLElement).blur();
                  }}
                  className="w-28 bg-surface-base border border-gray-border rounded-md px-3 py-2 text-[12px] text-warm-white font-mono outline-none focus:border-accent/40 transition-colors"
                />
              </div>
            </FormRow>
          );
        })}
      </div>

      <SavedToast visible={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// AI Agent section
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_SCHEDULE = DAY_LABELS.map((_, i) => ({
  day: i,
  open: "09:00",
  close: "17:00",
  closed: i === 0,
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

function AISection() {
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
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
        <p className="text-sm text-red-400">Couldn&apos;t load AI settings</p>
      </div>
    );
  }

  const schedule = data.businessHours?.schedule || DEFAULT_SCHEDULE;

  return (
    <>
      {saveError && (
        <div className="mb-4 px-4 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          Couldn&apos;t save — try again
        </div>
      )}

      {/* Personality + Rules */}
      <div className="rounded-lg border border-gray-border overflow-hidden mb-6">
        <FormRow label="Personality" description="How the AI sounds">
          <input
            type="text"
            value={data.personality}
            onChange={(e) => {
              const updated = { ...data, personality: e.target.value };
              setData(updated);
              latestRef.current = updated;
            }}
            onBlur={handleBlurSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLElement).blur();
            }}
            placeholder="e.g. warm and casual, professional, friendly"
            className="w-full bg-surface-base border border-gray-border rounded-md px-3 py-2 text-[13px] text-warm-white outline-none focus:border-accent/40 transition-colors placeholder:text-gray-faint"
          />
        </FormRow>
        <FormRow label="Business Rules" description="Persistent instructions" last>
          <textarea
            value={data.businessRules}
            onChange={(e) => {
              const updated = { ...data, businessRules: e.target.value };
              setData(updated);
              latestRef.current = updated;
            }}
            onBlur={handleBlurSave}
            placeholder={"e.g.\n• Always mention we're woman-owned\n• Never discount below 15%\n• Don't change the hero without asking"}
            rows={5}
            className="w-full bg-surface-base border border-gray-border rounded-md px-3 py-2 text-[13px] text-warm-white outline-none resize-none focus:border-accent/40 transition-colors placeholder:text-gray-faint"
          />
        </FormRow>
      </div>

      {/* Hours */}
      <div className="rounded-lg border border-gray-border overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-border/50">
          <span className="text-[11px] font-mono tracking-wider uppercase text-gray-faint">
            Business Hours
          </span>
        </div>
        {schedule.map((day, i) => (
          <div
            key={day.day}
            className={`flex items-center gap-3 px-5 py-3 ${
              i < schedule.length - 1 ? "border-b border-gray-border/50" : ""
            }`}
          >
            <span className="text-[13px] text-warm-white w-24 shrink-0">
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
                className="w-3.5 h-3.5 rounded border-gray-border accent-accent"
              />
              <span className="text-[11px] text-gray-muted">Open</span>
            </label>
            {!day.closed ? (
              <div className="flex items-center gap-1.5">
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
                  className="w-[110px] bg-surface-base border border-gray-border rounded-md px-2 py-1.5 text-[12px] text-warm-white font-mono outline-none focus:border-accent/40 transition-colors"
                />
                <span className="text-[11px] text-gray-faint">to</span>
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
                  className="w-[110px] bg-surface-base border border-gray-border rounded-md px-2 py-1.5 text-[12px] text-warm-white font-mono outline-none focus:border-accent/40 transition-colors"
                />
              </div>
            ) : (
              <span className="text-[12px] text-gray-faint italic">Closed</span>
            )}
          </div>
        ))}
      </div>

      <SavedToast visible={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Domains section
// ---------------------------------------------------------------------------

function DomainsSection() {
  return <DomainsClient initialDomains={[]} />;
}

// ---------------------------------------------------------------------------
// Billing section
// ---------------------------------------------------------------------------

function BillingSection() {
  return (
    <div className="rounded-lg border border-gray-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-5">
        <div>
          <div className="text-[10px] font-mono tracking-wider uppercase text-gray-faint mb-2">
            Current plan
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[20px] font-medium text-warm-white">$149/mo</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400">
              Active
            </span>
          </div>
          <p className="text-[12px] text-gray-faint">
            Everything included. Cancel anytime.
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const res = await fetch("/api/billing/portal", {
                method: "POST",
                credentials: "same-origin",
              });
              if (!res.ok) return;
              const { portalUrl } = await res.json();
              if (portalUrl) window.open(portalUrl, "_blank");
            } catch {}
          }}
          className="text-[12px] text-gray-muted border border-gray-border rounded-md px-4 py-2 hover:bg-surface-raised transition-colors"
        >
          Manage billing
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publishing section
// ---------------------------------------------------------------------------

function PublishingSection() {
  const dashboard = useDashboardOptional();

  return (
    <div className="rounded-lg border border-gray-border overflow-hidden">
      <div className="px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[14px] font-medium text-warm-white">Auto-publish</span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded ${
              dashboard?.autoPublish
                ? "text-emerald-400 bg-emerald-400/10"
                : "text-amber-400 bg-amber-400/10"
            }`}
          >
            {dashboard?.autoPublish ? "on" : "off"}
          </span>
        </div>
        <p className="text-[13px] text-gray-muted leading-relaxed">
          {dashboard?.autoPublish
            ? "AI changes go live immediately when you confirm them in chat."
            : "AI changes are saved as drafts for admin review before going live."}
        </p>
      </div>
      <div className="border-t border-gray-border/50 px-5 py-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
          <div>
            <p className="text-[12px] text-warm-white">Live mode</p>
            <p className="text-[11px] text-gray-faint">Changes publish immediately on confirm.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
          <div>
            <p className="text-[12px] text-warm-white">Draft mode</p>
            <p className="text-[11px] text-gray-faint">Admin reviews changes before they go live.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section headers
// ---------------------------------------------------------------------------

const SECTION_META: Record<string, { title: string; description: string }> = {
  profile: {
    title: "Business profile",
    description: "The source of truth for how customers find, understand, and book with you.",
  },
  brand: {
    title: "Brand system",
    description: "The visual rules your site uses when the AI adds or refreshes content.",
  },
  ai: {
    title: "AI guardrails",
    description: "Rules, hours, and tone the AI follows before it changes anything customer-facing.",
  },
  domains: {
    title: "Domains",
    description: "Where customers and owners access the live site and dashboard.",
  },
  billing: {
    title: "Plan & Billing",
    description: "One plan, one operating cost, no maintenance upsells.",
  },
  publishing: {
    title: "Publishing control",
    description: "Decide whether confirmed AI work ships immediately or waits for review.",
  },
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-3">Couldn&apos;t load settings</p>
          <button
            onClick={() => {
              setLoadError(false);
              fetch("/api/content/settings", { credentials: "same-origin" })
                .then((res) => {
                  if (!res.ok) throw new Error();
                  return res.json();
                })
                .then((data) => setSettings(data))
                .catch(() => setLoadError(true));
            }}
            className="px-4 py-2 rounded-md border border-gray-border text-xs text-gray-muted hover:bg-surface-raised transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const meta = SECTION_META[activeSection];

  return (
    <div className="flex h-full">
      {/* Settings nav */}
      <nav className="w-[200px] shrink-0 border-r border-gray-border p-6 pt-8 space-y-1 hidden md:block">
        <div className="text-[10px] font-mono tracking-wider uppercase text-gray-faint mb-3 px-3">
          Settings
        </div>
        {SETTINGS_SECTIONS.map((item) => {
          if (item.id === "divider") {
            return <div key="divider" className="border-t border-gray-border my-2" />;
          }
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full text-left text-[13px] px-3 py-1.5 rounded transition-colors ${
                activeSection === item.id
                  ? "bg-surface-raised text-warm-white"
                  : "text-gray-muted hover:text-warm-white hover:bg-surface-raised/50"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile section select */}
      <div className="md:hidden border-b border-gray-border px-4 py-3">
        <DashSelect
          value={activeSection}
          onChange={(e) => setActiveSection(e.target.value)}
          options={SETTINGS_SECTIONS.filter((s) => s.id !== "divider").map((item) => ({
            value: item.id,
            label: item.label,
          }))}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
        <div className="max-w-2xl">
          <div className="mb-8 rounded-2xl border border-glass-border bg-glass p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Operating rules
            </p>
            <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-warm-white">
              Keep the AI aligned with the business
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">
              Settings should reduce owner review time: accurate identity, reliable booking links, clear brand rules, and explicit boundaries for what the AI can publish.
            </p>
          </div>

          {/* Section header */}
          {meta && (
            <div className="mb-8">
              <h1 className="text-[20px] font-medium text-warm-white">{meta.title}</h1>
              <p className="text-[13px] text-gray-muted mt-1">{meta.description}</p>
            </div>
          )}

          {/* Section content */}
          {activeSection === "profile" && settings && (
            <ProfileSection settings={settings} setSettings={setSettings} />
          )}
          {activeSection === "profile" && !settings && (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-surface-raised rounded-lg" />
              ))}
            </div>
          )}
          {activeSection === "brand" && <BrandSection />}
          {activeSection === "ai" && <AISection />}
          {activeSection === "domains" && <DomainsSection />}
          {activeSection === "billing" && <BillingSection />}
          {activeSection === "publishing" && <PublishingSection />}
        </div>
      </div>
    </div>
  );
}
