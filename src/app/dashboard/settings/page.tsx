"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, Code2, Download, ExternalLink, Image as ImageIcon, Link2, Plus, Trash2 } from "lucide-react";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { OwnershipSection } from "@/components/dashboard/OwnershipSection";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { DomainsClient } from "./DomainsClient";
import { DashSelect, FormRow } from "@/components/dashboard/ui";
import { SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL } from "@/lib/pricing";
import type { CustomRepoExternalDependency } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsData = Record<string, string>;
type ThemeData = Record<string, unknown>;
type NavigationData = {
  menuItems: { label: string; href: string }[];
  ctaLabel: string;
  ctaHref: string;
};
type FooterData = {
  tagline: string;
  columns: { heading: string; links: { label: string; href: string }[] }[];
  socialLinks: { label: string; href: string }[];
  copyrightText: string;
};
type SiteCapabilitiesData = {
  supportsPageConfig?: boolean;
  supportsNavigationConfig?: boolean;
  supportsFooterConfig?: boolean;
  supportsDraftPreview?: boolean;
  supportsInlineEditing?: boolean;
  designTokens?: string[];
  customOnlyFeatures?: string[];
  customComponents?: { id: string; label: string; description?: string; adminOnly: boolean; supportedProps?: string[] }[];
};
type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";
type DependencyHealthData = {
  deliveryModel: string;
  dependencies: CustomRepoExternalDependency[];
  blockingDependencies: CustomRepoExternalDependency[];
  hasBlockingDependency: boolean;
  summary: {
    status: string;
    severity: string;
  };
};

function useDashboardApiPath() {
  const dashboard = useDashboardOptional();
  return useCallback(
    (path: string) => dashboard?.dashboardHref(path) ?? path,
    [dashboard],
  );
}

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
  { key: "bookingUrl", label: "Primary action URL", description: "Where visitors go next", mono: true },
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
  { id: "profile", label: "Business" },
  { id: "site-config", label: "Site config" },
  { id: "dependencies", label: "Dependencies" },
  { id: "utilities", label: "Utilities" },
  { id: "ownership", label: "Ownership" },
  { id: "domains", label: "Domains" },
  { id: "billing", label: "Billing" },
] as const;

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function SaveStatusPill({ status }: { status: SaveStatus }) {
  const copy: Record<SaveStatus, { label: string; className: string }> = {
    idle: { label: "Saved", className: "border-gray-border text-gray-faint" },
    dirty: { label: "Unsaved changes", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
    saving: { label: "Saving...", className: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
    saved: { label: "Saved", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
    error: { label: "Could not save", className: "border-red-400/30 bg-red-400/10 text-red-300" },
  };
  const item = copy[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${item.className}`}>
      {item.label}
    </span>
  );
}

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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const latestRef = useRef(settings);
  const apiPath = useDashboardApiPath();
  useEffect(() => {
    latestRef.current = settings;
  });

  const saveSettings = useCallback(async (data: SettingsData) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(apiPath("/api/content/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }, [apiPath]);

  const handleChange = useCallback(
    (key: string, value: string) => {
      const updated = { ...latestRef.current, [key]: value };
      setSettings(updated);
      latestRef.current = updated;
      setSaveStatus("dirty");
    },
    [setSettings],
  );

  const handleBlurSave = useCallback(() => {
    saveSettings(latestRef.current);
  }, [saveSettings]);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <SaveStatusPill status={saveStatus} />
      </div>

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
    </>
  );
}

// ---------------------------------------------------------------------------
// Brand section
// ---------------------------------------------------------------------------

function BrandSection() {
  const [theme, setTheme] = useState<ThemeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const latestRef = useRef<ThemeData | null>(null);
  const apiPath = useDashboardApiPath();

  useEffect(() => {
    fetch(apiPath("/api/content/theme"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setTheme(data);
        latestRef.current = data;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiPath]);

  const saveTheme = useCallback(async (data: ThemeData) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(apiPath("/api/content/theme"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }, [apiPath]);

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      setTheme((prev) => {
        if (!prev) return prev;
        const updated = key.includes(".")
          ? setNestedValue(prev, key, value)
          : { ...prev, [key]: value };
        latestRef.current = updated;
        setSaveStatus("dirty");
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
      <div className="mb-4 flex justify-end">
        <SaveStatusPill status={saveStatus} />
      </div>

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

// Kept temporarily for rollback while AI rules move into Ask AI.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AISection() {
  const [data, setData] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const latestRef = useRef<AISettings | null>(null);
  const apiPath = useDashboardApiPath();

  useEffect(() => {
    fetch(apiPath("/api/tenant-settings"), { credentials: "same-origin" })
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
  }, [apiPath]);

  const save = useCallback(async (settings: AISettings) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(apiPath("/api/tenant-settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }, [apiPath]);

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
      <div className="mb-4 flex justify-end">
        <SaveStatusPill status={saveStatus} />
      </div>

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
              setSaveStatus("dirty");
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
              setSaveStatus("dirty");
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
                  setSaveStatus("dirty");
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
                    setSaveStatus("dirty");
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
                    setSaveStatus("dirty");
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
// Utilities section
// ---------------------------------------------------------------------------

function UtilitiesSection() {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);

  const utilities = [
    {
      title: "Photo library",
      description: "Upload and reuse real photos, logos, and files the AI can reference in chat.",
      href: "/dashboard/assets",
      icon: ImageIcon,
    },
    {
      title: "Export & handoff",
      description: "Download content and asset manifests or start a provider handoff.",
      href: "/dashboard/settings#ownership",
      icon: Download,
    },
    {
      title: "Connection setup",
      description: "Repair source health, OAuth, API keys, and manual setup paths.",
      href: "/dashboard/sources",
      icon: Link2,
    },
  ];

  return (
    <div className="grid gap-3">
      {utilities.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={dashboardHref(item.href)}
            className="group flex items-start gap-4 rounded-xl border border-gray-border bg-surface-raised px-4 py-4 transition-colors hover:border-accent/35"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-accent">
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-warm-white group-hover:text-white">
                {item.title}
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-gray-muted">
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site config section
// ---------------------------------------------------------------------------

const SITE_CONFIG_TABS = ["design", "navigation", "capabilities", "components"] as const;

function SiteConfigSection() {
  const [tab, setTab] = useState<(typeof SITE_CONFIG_TABS)[number]>("design");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {SITE_CONFIG_TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`h-8 rounded-md border px-3 text-[12px] capitalize transition-colors ${
              tab === item
                ? "border-accent/40 bg-accent/15 text-warm-white"
                : "border-gray-border text-gray-muted hover:text-warm-white"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "design" && <BrandSection />}
      {tab === "navigation" && <NavigationFooterSection />}
      {tab === "capabilities" && <CapabilitiesSection />}
      {tab === "components" && <CustomComponentsSection />}
    </div>
  );
}

function NavigationFooterSection() {
  const apiPath = useDashboardApiPath();
  const [navigation, setNavigation] = useState<NavigationData | null>(null);
  const [footer, setFooter] = useState<FooterData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    Promise.all([
      fetch(apiPath("/api/content/navigation"), { credentials: "same-origin" }).then((res) => res.ok ? res.json() : null),
      fetch(apiPath("/api/content/footer"), { credentials: "same-origin" }).then((res) => res.ok ? res.json() : null),
    ]).then(([nav, foot]) => {
      setNavigation(nav);
      setFooter(foot);
    }).catch(() => setSaveStatus("error"));
  }, [apiPath]);

  const saveContent = useCallback(async (section: "navigation" | "footer", data: NavigationData | FooterData) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(apiPath(`/api/content/${section}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      setSaveStatus(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [apiPath]);

  if (!navigation || !footer) {
    return <SkeletonLine width="w-full" height="h-20" />;
  }

  const updateNavItem = (index: number, key: "label" | "href", value: string) => {
    const next = {
      ...navigation,
      menuItems: navigation.menuItems.map((item, i) => i === index ? { ...item, [key]: value } : item),
    };
    setNavigation(next);
    setSaveStatus("dirty");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <SaveStatusPill status={saveStatus} />
      </div>
      <div className="rounded-lg border border-gray-border overflow-hidden">
        <div className="border-b border-gray-border px-5 py-3">
          <p className="text-[11px] font-mono uppercase tracking-wider text-gray-faint">Navigation</p>
        </div>
        {navigation.menuItems.map((item, index) => (
          <div key={`${item.label}-${index}`} className="grid grid-cols-1 gap-2 border-b border-gray-border/50 px-5 py-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={item.label}
              onChange={(event) => updateNavItem(index, "label", event.target.value)}
              onBlur={() => saveContent("navigation", navigation)}
              className="rounded-md border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
            />
            <input
              value={item.href}
              onChange={(event) => updateNavItem(index, "href", event.target.value)}
              onBlur={() => saveContent("navigation", navigation)}
              className="rounded-md border border-gray-border bg-surface-base px-3 py-2 font-mono text-[12px] text-accent outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const next = { ...navigation, menuItems: navigation.menuItems.filter((_, i) => i !== index) };
                setNavigation(next);
                saveContent("navigation", next);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-border text-gray-muted hover:text-red-300"
              aria-label="Remove navigation item"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => {
              const next = { ...navigation, menuItems: [...navigation.menuItems, { label: "New link", href: "/" }] };
              setNavigation(next);
              saveContent("navigation", next);
            }}
            className="inline-flex items-center gap-2 rounded-md border border-gray-border px-3 py-2 text-[12px] text-gray-muted hover:text-warm-white"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add link
          </button>
          <div className="grid w-full flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={navigation.ctaLabel}
              onChange={(event) => {
                const next = { ...navigation, ctaLabel: event.target.value };
                setNavigation(next);
                setSaveStatus("dirty");
              }}
              onBlur={() => saveContent("navigation", navigation)}
              placeholder="CTA label"
              className="rounded-md border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
            />
            <input
              value={navigation.ctaHref}
              onChange={(event) => {
                const next = { ...navigation, ctaHref: event.target.value };
                setNavigation(next);
                setSaveStatus("dirty");
              }}
              onBlur={() => saveContent("navigation", navigation)}
              placeholder="CTA href"
              className="rounded-md border border-gray-border bg-surface-base px-3 py-2 font-mono text-[12px] text-accent outline-none"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-border overflow-hidden">
        <FormRow label="Footer tagline" description="Short footer copy">
          <textarea
            value={footer.tagline}
            onChange={(event) => {
              setFooter({ ...footer, tagline: event.target.value });
              setSaveStatus("dirty");
            }}
            onBlur={() => saveContent("footer", footer)}
            rows={2}
            className="w-full resize-none rounded-md border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
          />
        </FormRow>
        <FormRow label="Copyright" description="Bottom legal line" last>
          <input
            value={footer.copyrightText}
            onChange={(event) => {
              setFooter({ ...footer, copyrightText: event.target.value });
              setSaveStatus("dirty");
            }}
            onBlur={() => saveContent("footer", footer)}
            className="w-full rounded-md border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
          />
        </FormRow>
      </div>
    </div>
  );
}

function CapabilitiesSection() {
  const apiPath = useDashboardApiPath();
  const [capabilities, setCapabilities] = useState<SiteCapabilitiesData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    fetch(apiPath("/api/tenant-settings"), { credentials: "same-origin" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setCapabilities({
        supportsPageConfig: data?.siteCapabilities?.supportsPageConfig ?? true,
        supportsNavigationConfig: data?.siteCapabilities?.supportsNavigationConfig ?? true,
        supportsFooterConfig: data?.siteCapabilities?.supportsFooterConfig ?? true,
        supportsDraftPreview: data?.siteCapabilities?.supportsDraftPreview ?? data?.customRepo?.supportsDraftPreview ?? true,
        supportsInlineEditing: data?.siteCapabilities?.supportsInlineEditing ?? data?.customRepo?.supportsInlineEditing ?? true,
        designTokens: data?.siteCapabilities?.designTokens || data?.customRepo?.supportedDesignTokens || ["colors", "fonts", "buttons", "spacing", "radius", "motion", "imagery"],
        customOnlyFeatures: data?.siteCapabilities?.customOnlyFeatures || data?.customRepo?.customFeatures || [],
      }))
      .catch(() => setSaveStatus("error"));
  }, [apiPath]);

  const saveCapabilities = useCallback(async (next: SiteCapabilitiesData) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(apiPath("/api/tenant-settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ siteCapabilities: next }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [apiPath]);

  if (!capabilities) return <SkeletonLine width="w-full" height="h-20" />;

  const toggles: Array<[keyof SiteCapabilitiesData, string]> = [
    ["supportsPageConfig", "Page structure"],
    ["supportsNavigationConfig", "Navigation"],
    ["supportsFooterConfig", "Footer"],
    ["supportsDraftPreview", "Draft preview"],
    ["supportsInlineEditing", "Inline editing"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><SaveStatusPill status={saveStatus} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {toggles.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between rounded-lg border border-gray-border bg-surface-raised px-4 py-3">
            <span className="text-[13px] text-warm-white">{label}</span>
            <input
              type="checkbox"
              checked={Boolean(capabilities[key])}
              onChange={(event) => {
                const next = { ...capabilities, [key]: event.target.checked };
                setCapabilities(next);
                saveCapabilities(next);
              }}
              className="h-4 w-4 accent-accent"
            />
          </label>
        ))}
      </div>
      <div className="rounded-lg border border-gray-border p-4">
        <label className="text-[11px] uppercase tracking-wider text-gray-faint">Custom-only features</label>
        <input
          value={(capabilities.customOnlyFeatures || []).join(", ")}
          onChange={(event) => {
            const next = {
              ...capabilities,
              customOnlyFeatures: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
            };
            setCapabilities(next);
            setSaveStatus("dirty");
          }}
          onBlur={() => saveCapabilities(capabilities)}
          placeholder="cart, rewards, booking-flow"
          className="mt-2 w-full rounded-md border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
        />
      </div>
    </div>
  );
}

function CustomComponentsSection() {
  const dashboard = useDashboardOptional();
  const apiPath = useDashboardApiPath();
  const tenantId = dashboard?.tenantId || "";
  const [components, setComponents] = useState<NonNullable<SiteCapabilitiesData["customComponents"]>>([]);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    if (!tenantId) return;
    fetch(apiPath(`/api/admin/component-registry?tenant=${tenantId}`), { credentials: "same-origin" })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Admin access required")))
      .then((data) => setComponents(data.components || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load custom components"));
  }, [apiPath, tenantId]);

  const saveComponents = useCallback(async (next: NonNullable<SiteCapabilitiesData["customComponents"]>) => {
    setSaveStatus("saving");
    setError("");
    try {
      const res = await fetch(apiPath("/api/admin/component-registry"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ tenant: tenantId, components: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save components");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("error");
      setError(err instanceof Error ? err.message : "Could not save components");
    }
  }, [apiPath, tenantId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-gray-muted">Admin-only custom components exposed to this site manifest.</p>
        <SaveStatusPill status={saveStatus} />
      </div>
      {error && <p className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">{error}</p>}
      <div className="space-y-3">
        {components.map((component, index) => (
          <div key={`${component.id}-${index}`} className="rounded-lg border border-gray-border bg-surface-raised p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] text-gray-faint">
              <Code2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              Admin component
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={component.id}
                onChange={(event) => {
                  const next = components.map((item, i) => i === index ? { ...item, id: event.target.value } : item);
                  setComponents(next);
                  setSaveStatus("dirty");
                }}
                onBlur={() => saveComponents(components)}
                placeholder="component-id"
                className="rounded-md border border-gray-border bg-surface-base px-3 py-2 font-mono text-[12px] text-accent outline-none"
              />
              <input
                value={component.label}
                onChange={(event) => {
                  const next = components.map((item, i) => i === index ? { ...item, label: event.target.value } : item);
                  setComponents(next);
                  setSaveStatus("dirty");
                }}
                onBlur={() => saveComponents(components)}
                placeholder="Display label"
                className="rounded-md border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const next = [...components, { id: "custom-component", label: "Custom component", adminOnly: true }];
          setComponents(next);
          saveComponents(next);
        }}
        className="inline-flex items-center gap-2 rounded-md border border-gray-border px-3 py-2 text-[12px] text-gray-muted hover:text-warm-white"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        Add component
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dependency health section
// ---------------------------------------------------------------------------

const DEPENDENCY_STATUS_COPY: Record<string, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  degraded: { label: "Degraded", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  paused: { label: "Paused", className: "border-red-400/30 bg-red-400/10 text-red-300" },
  failing: { label: "Failing", className: "border-red-400/30 bg-red-400/10 text-red-300" },
  unknown: { label: "Unknown", className: "border-gray-border text-gray-faint" },
};

function DependencyStatusPill({ status }: { status: string }) {
  const copy = DEPENDENCY_STATUS_COPY[status] || DEPENDENCY_STATUS_COPY.unknown;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${copy.className}`}>
      {copy.label}
    </span>
  );
}

function DependencyHealthSection() {
  const apiPath = useDashboardApiPath();
  const [data, setData] = useState<DependencyHealthData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(apiPath("/api/custom-repo/dependencies"), { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load dependency health");
        return res.json();
      })
      .then((next) => {
        setError("");
        setData(next);
      })
      .catch(() => setError("Could not load dependency health."));
  }, [apiPath]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-[12px] text-red-200">
        {error}
      </div>
    );
  }

  if (!data) return <SkeletonLine width="w-full" height="h-24" />;

  if (data.deliveryModel !== "custom_repo") {
    return (
      <div className="rounded-lg border border-gray-border bg-surface-raised p-4">
        <p className="text-[13px] text-warm-white">Platform template site</p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
          No custom repo dependency checks are needed for this tenant.
        </p>
      </div>
    );
  }

  const hasDependencies = data.dependencies.length > 0;

  return (
    <div className="space-y-4">
      {data.hasBlockingDependency && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-300/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" strokeWidth={1.7} />
            <div>
              <p className="text-[13px] font-medium text-amber-50">
                A custom repo dependency needs attention before the client site depends on it.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">
                Strelva is showing this here so paused services are caught before they look like a storefront or AI issue.
              </p>
            </div>
          </div>
        </div>
      )}

      {!hasDependencies && (
        <div className="rounded-lg border border-gray-border bg-surface-raised p-4">
          <p className="text-[13px] text-warm-white">No external dependencies recorded</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
            Add dependencies to the tenant custom repo metadata as they become operationally important.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {data.dependencies.map((dependency) => (
          <div key={dependency.id} className="rounded-lg border border-gray-border bg-surface-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-warm-white">{dependency.name}</p>
                <p className="mt-1 text-[12px] text-gray-muted">{dependency.provider} · {dependency.purpose}</p>
              </div>
              <DependencyStatusPill status={dependency.status} />
            </div>
            {(dependency.source || dependency.detectedAt) && (
              <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-gray-faint">
                {dependency.source || "Recorded dependency"}{dependency.detectedAt ? ` · ${dependency.detectedAt}` : ""}
              </p>
            )}
            {dependency.notes && (
              <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{dependency.notes}</p>
            )}
            {dependency.actionUrl && (
              <a
                href={dependency.actionUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80"
              >
                Open dependency
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing section
// ---------------------------------------------------------------------------

const BILLING_STATUS_COPY: Record<SubscriptionStatus, { label: string; className: string; note: string }> = {
  active: {
    label: "Active",
    className: "bg-emerald-400/10 text-emerald-400",
    note: "Everything included. Cancel anytime.",
  },
  trialing: {
    label: "Trialing",
    className: "bg-sky-400/10 text-sky-400",
    note: "Trial access is active.",
  },
  past_due: {
    label: "Past due",
    className: "bg-amber-400/10 text-amber-400",
    note: "Payment needs attention to keep the dashboard fully available.",
  },
  cancelled: {
    label: "Canceled",
    className: "bg-red-400/10 text-red-400",
    note: "This subscription is canceled.",
  },
  none: {
    label: "Not set up",
    className: "bg-gray-border text-gray-muted",
    note: "No subscription is connected yet.",
  },
};

const FOUNDER_COMP_COPY = {
  label: "Founder comp",
  className: "bg-amber-300/12 text-amber-200",
  note: "Full access is comped for this founder account. No customer billing is due.",
};

function BillingSection() {
  const dashboard = useDashboardOptional();
  const apiPath = useDashboardApiPath();
  const [billingError, setBillingError] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);
  const status = dashboard?.subscriptionStatus ?? "none";
  const isFounderComp = dashboard?.planOverride === "founder_comp";
  const copy = isFounderComp ? FOUNDER_COMP_COPY : BILLING_STATUS_COPY[status];

  return (
    <div className="rounded-lg border border-gray-border overflow-hidden">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-mono tracking-wider uppercase text-gray-faint mb-2">
            Current plan
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[20px] font-medium text-warm-white">
              {isFounderComp ? "Founder comp" : SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL}
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${copy.className}`}>
              {copy.label}
            </span>
          </div>
          <p className="text-[12px] text-gray-faint">
            {copy.note}
          </p>
          {billingError && (
            <p className="mt-3 text-[12px] text-amber-300">{billingError}</p>
          )}
        </div>
        <button
          onClick={async () => {
            setBillingError("");
            setOpeningPortal(true);
            try {
              const res = await fetch(apiPath("/api/billing/portal"), {
                method: "POST",
                credentials: "same-origin",
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) {
                setBillingError(
                  res.status === 404 || !dashboard?.hasStripeCustomer
                    ? "Billing is not connected yet. Ask Strelva to turn on the billing portal."
                    : body?.error || "Couldn't open the billing portal. Try again.",
                );
                return;
              }
              const { portalUrl } = body;
              if (portalUrl) window.open(portalUrl, "_blank");
            } catch {
              setBillingError("Couldn't open the billing portal. Check your connection and try again.");
            } finally {
              setOpeningPortal(false);
            }
          }}
          disabled={openingPortal || isFounderComp}
          className="min-h-[38px] w-full rounded-md border border-gray-border px-4 py-2 text-[12px] text-gray-muted transition-colors hover:bg-surface-raised disabled:opacity-60 sm:w-auto"
        >
          {isFounderComp ? "No billing action" : openingPortal ? "Opening..." : "Manage billing"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publishing section
// ---------------------------------------------------------------------------

// Kept temporarily for rollback while publishing mode moves out of client settings.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PublishingSection() {
  const dashboard = useDashboardOptional();
  const apiPath = useDashboardApiPath();
  const [autoPublish, setAutoPublish] = useState(dashboard?.autoPublish ?? true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(apiPath("/api/tenant-settings"), { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load publishing settings");
        return res.json();
      })
      .then((data) => {
        if (typeof data?.autoPublish === "boolean") {
          setAutoPublish(data.autoPublish);
        }
      })
      .catch(() => setError("Couldn't load publishing mode. Showing the last known dashboard value."))
      .finally(() => setLoading(false));
  }, [apiPath]);

  const saveAutoPublish = useCallback(async (next: boolean) => {
    setError("");
    setSaved(false);
    setSaving(true);
    const previous = autoPublish;
    setAutoPublish(next);
    try {
      const res = await fetch(apiPath("/api/tenant-settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ autoPublish: next }),
      });
      if (!res.ok) throw new Error("Failed to save publishing mode");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setAutoPublish(previous);
      setError("Couldn't save publishing mode. No change was made.");
    } finally {
      setSaving(false);
    }
  }, [apiPath, autoPublish]);

  return (
    <div className="rounded-lg border border-gray-border overflow-hidden">
      <div className="px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[14px] font-medium text-warm-white">Auto-publish</span>
          <button
            type="button"
            onClick={() => saveAutoPublish(!autoPublish)}
            disabled={loading || saving}
            aria-pressed={autoPublish}
            className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors disabled:opacity-60 ${
              autoPublish
                ? "text-emerald-400 bg-emerald-400/10"
                : "text-amber-400 bg-amber-400/10"
            }`}
          >
            {saving ? "saving" : autoPublish ? "on" : "off"}
          </button>
        </div>
        <p className="text-[13px] text-gray-muted leading-relaxed">
          {autoPublish
            ? "Changes go live immediately when you confirm them in chat."
            : "Changes are saved for Strelva to check before going live."}
        </p>
        {error && <p className="mt-3 text-[12px] text-amber-300">{error}</p>}
        {saved && <p className="mt-3 text-[12px] text-emerald-300">Publishing mode saved.</p>}
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
    description: "Core identity and the primary action visitors should take. Brand, hours, and AI rules now live in Ask AI.",
  },
  "site-config": {
    title: "Site configurability",
    description: "Design tokens, navigation, footer content, supported capabilities, and custom components.",
  },
  dependencies: {
    title: "Custom repo dependencies",
    description: "External services the custom site relies on, with paused or failing services called out before they break the storefront.",
  },
  utilities: {
    title: "Operations utilities",
    description: "Useful tools that support the AI, exports, and connection setup.",
  },
  ownership: {
    title: "Ownership and handoff",
    description: "Know what the business owns, what Strelva manages, and how to leave cleanly.",
  },
  domains: {
    title: "Domain health",
    description: "Production and admin domains, DNS records, SSL state, and repair steps.",
  },
  billing: {
    title: "Billing",
    description: "One plan, one operating cost, no maintenance upsells.",
  },
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const apiPath = useDashboardApiPath();

  const setSection = useCallback((section: string) => {
    setActiveSection(section);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${section}`);
    }
  }, []);

  useEffect(() => {
    fetch(apiPath("/api/content/settings"), { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => setSettings(data))
      .catch(() => setLoadError(true));
  }, [apiPath]);

  useEffect(() => {
    const applyHashSection = () => {
      const section = window.location.hash.replace("#", "");
      if (SETTINGS_SECTIONS.some((item) => item.id === section)) {
        setActiveSection(section);
      } else if (section) {
        setActiveSection("profile");
      }
    };
    applyHashSection();
    window.addEventListener("hashchange", applyHashSection);
    return () => window.removeEventListener("hashchange", applyHashSection);
  }, []);

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-3">Couldn&apos;t load settings</p>
          <button
            onClick={() => {
              setLoadError(false);
              fetch(apiPath("/api/content/settings"), { credentials: "same-origin" })
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
    <div className="flex h-full min-w-0 flex-col md:flex-row">
      {/* Settings nav */}
      <nav className="w-[200px] shrink-0 border-r border-gray-border p-6 pt-8 space-y-1 hidden md:block">
        <div className="text-[10px] font-mono tracking-wider uppercase text-gray-faint mb-3 px-3">
          Settings
        </div>
        {SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`mb-1 w-full rounded-md border px-3 py-2 text-left text-[13px] transition-colors ${
              activeSection === item.id
                ? "border-gray-border bg-surface-raised text-warm-white"
                : "border-transparent text-gray-muted hover:border-gray-border/60 hover:bg-surface-raised/50 hover:text-warm-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Mobile section select */}
      <div className="shrink-0 border-b border-gray-border px-4 py-3 md:hidden">
        <DashSelect
          value={activeSection}
          onChange={(e) => setSection(e.target.value)}
          options={SETTINGS_SECTIONS.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 overflow-y-auto p-4 pb-28 md:p-8 lg:p-10">
        <div className={activeSection === "ownership" ? "max-w-5xl" : "max-w-2xl"}>
          <div className="mb-8 rounded-2xl border border-glass-border bg-glass p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Operations
            </p>
            <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-warm-white">
              Settings with real ownership impact
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">
              Use this area for domains, billing, exports, and handoff. Day-to-day business instructions now happen in Ask AI.
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
          {activeSection === "site-config" && <SiteConfigSection />}
          {activeSection === "dependencies" && <DependencyHealthSection />}
          {activeSection === "utilities" && <UtilitiesSection />}
          {activeSection === "ownership" && <OwnershipSection />}
          {activeSection === "domains" && <DomainsSection />}
          {activeSection === "billing" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}
