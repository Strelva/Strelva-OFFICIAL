"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Download, Image as ImageIcon, Link2 } from "lucide-react";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { OwnershipSection } from "@/components/dashboard/OwnershipSection";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { DomainsClient } from "./DomainsClient";
import { DashSelect, FormRow } from "@/components/dashboard/ui";
import { SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsData = Record<string, string>;
type ThemeData = Record<string, unknown>;
type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";

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
  { id: "profile", label: "Business" },
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

// Kept temporarily for rollback while brand controls move into Ask AI.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <div className="flex items-center justify-between px-5 py-5">
        <div>
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
                    ? "Billing is not connected yet. Ask Scaffold Web to turn on the billing portal."
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
          className="text-[12px] text-gray-muted border border-gray-border rounded-md px-4 py-2 hover:bg-surface-raised transition-colors disabled:opacity-60"
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
            ? "AI changes go live immediately when you confirm them in chat."
            : "AI changes are saved for Scaffold Web to check before going live."}
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
    description: "Core identity and booking details. Brand, hours, and AI rules now live in Ask AI.",
  },
  utilities: {
    title: "Operations utilities",
    description: "Useful tools that support the AI, exports, and connection setup.",
  },
  ownership: {
    title: "Ownership and handoff",
    description: "Know what the business owns, what Scaffold Web manages, and how to leave cleanly.",
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
    <div className="flex h-full">
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
      <div className="md:hidden border-b border-gray-border px-4 py-3">
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
      <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
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
          {activeSection === "utilities" && <UtilitiesSection />}
          {activeSection === "ownership" && <OwnershipSection />}
          {activeSection === "domains" && <DomainsSection />}
          {activeSection === "billing" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}
