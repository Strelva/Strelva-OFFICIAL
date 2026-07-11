"use client";

import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Code2, Download, ExternalLink, Image as ImageIcon, Link2, Plus, Sparkles, Trash2 } from "lucide-react";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
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

type IdentityField = {
  key: string;
  label: string;
  description: string;
  multiline?: boolean;
  mono?: boolean;
  /** When set, the field renders as a dropdown instead of a text input. */
  options?: { value: string; label: string }[];
};

/** Business — the public-facing identity of the business this account manages.
 *  (The personal greeting comes from the login, shown read-only in Account.) */
const BUSINESS_FIELDS: readonly IdentityField[] = [
  { key: "siteName", label: "Business name", description: "Your business name" },
  { key: "ownerName", label: "Owner name", description: "Primary contact for the business" },
  {
    key: "businessModel",
    label: "Business type",
    description: "Sets whether Google Business & Reviews apply to you",
    options: [
      { value: "", label: "Auto (based on your site)" },
      { value: "local", label: "Local: customers visit or I serve an area" },
      { value: "online", label: "Online only: no physical/local presence" },
      { value: "hybrid", label: "Both online and local" },
    ],
  },
  { key: "siteTagline", label: "Tagline", description: "Search results & header" },
  { key: "siteDescription", label: "Description", description: "SEO description", multiline: true },
  { key: "bookingUrl", label: "Primary action URL", description: "Where visitors go next", mono: true },
  { key: "footerTagline", label: "Footer tagline", description: "Bottom of your site" },
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

// Four top-level groups. The five previously-thin business/site sections
// (Business info, Branding, Site config, Connected services, Shortcuts) — plus
// Ownership — now live as labeled in-page sections inside "Business".
const SETTINGS_SECTIONS = [
  { id: "business", label: "Business" },
  { id: "account", label: "Account" },
  { id: "domains", label: "Domains" },
  { id: "plan", label: "Plan" },
] as const;

// In-page anchors within the Business group. Old settings hashes (deep links
// from proxy.ts, onboarding, the ownership redirect) map onto these so existing
// links keep landing on the right content.
const BUSINESS_ANCHORS = [
  "profile",
  "branding",
  "site-config",
  "dependencies",
  "utilities",
  "ownership",
] as const;

// Legacy hash -> current top-level section. Business sub-hashes resolve to the
// Business group and then scroll to their anchor; billing -> plan.
const LEGACY_HASH_TO_SECTION: Record<string, string> = {
  profile: "business",
  branding: "business",
  "site-config": "business",
  dependencies: "business",
  utilities: "business",
  ownership: "business",
  billing: "plan",
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function SaveStatusPill({ status }: { status: SaveStatus }) {
  // Nothing has happened yet at rest, so don't show a "Saved" pill before the
  // owner has edited anything — it reads as a save that never occurred.
  if (status === "idle") return null;
  const copy: Record<SaveStatus, { label: string; className: string }> = {
    idle: { label: "Saved", className: "border-glass-border text-gray-faint" },
    dirty: { label: "Unsaved changes", className: "border-warning/30 bg-warning/10 text-warning" },
    saving: { label: "Saving...", className: "border-accent/30 bg-accent-dim text-accent" },
    saved: { label: "Saved", className: "border-positive/30 bg-positive/10 text-positive" },
    error: { label: "Could not save", className: "border-critical/30 bg-critical/10 text-critical" },
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
  fields,
  readOnly = false,
}: {
  settings: SettingsData;
  setSettings: (s: SettingsData) => void;
  fields: readonly IdentityField[];
  readOnly?: boolean;
}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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

  // Lightweight per-field validation. Returns an error string, or "" if valid.
  const validateField = useCallback((key: string, value: string): string => {
    const trimmed = value.trim();
    if (key === "siteName" && !trimmed) {
      return "Site Name is required.";
    }
    if (key === "bookingUrl" && trimmed && !/^https?:\/\/\S+/i.test(trimmed)) {
      return "Enter a full URL starting with http:// or https://";
    }
    return "";
  }, []);

  const handleBlurSave = useCallback((key: string) => {
    const value = latestRef.current[key] || "";
    const message = validateField(key, value);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
    if (message) {
      // Don't persist an invalid field; surface the problem inline instead.
      return;
    }
    saveSettings(latestRef.current);
  }, [saveSettings, validateField]);

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-3">
        {readOnly && (
          <span className="text-[11px] text-gray-muted">Editing is disabled in the demo</span>
        )}
        <SaveStatusPill status={saveStatus} />
      </div>

      <div className="rounded-lg border border-glass-border overflow-hidden">
        {fields.map((field, i) => (
          <FormRow
            key={field.key}
            label={field.label}
            description={field.description}
            last={i === fields.length - 1}
          >
            {field.options ? (
              <DashSelect
                value={settings[field.key] || ""}
                onChange={(e) => {
                  handleChange(field.key, e.target.value);
                  saveSettings(latestRef.current);
                }}
                disabled={readOnly}
                options={field.options}
              />
            ) : field.multiline ? (
              <textarea
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                onBlur={() => handleBlurSave(field.key)}
                disabled={readOnly}
                rows={2}
                className="w-full bg-surface-base border border-glass-border rounded-lg px-3 py-2 text-[13px] text-warm-white outline-none resize-none focus:border-accent/40 transition-colors disabled:opacity-60"
              />
            ) : (
              <input
                type="text"
                value={settings[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                onBlur={() => handleBlurSave(field.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLElement).blur();
                }}
                disabled={readOnly}
                className={`w-full bg-surface-base border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-accent/40 transition-colors disabled:opacity-60 ${
                  fieldErrors[field.key] ? "border-critical/50" : "border-glass-border"
                } ${
                  field.mono
                    ? "text-accent text-[12px]"
                    : "text-warm-white"
                }`}
              />
            )}
            {fieldErrors[field.key] && (
              <p className="mt-1.5 text-[11px] text-critical">{fieldErrors[field.key]}</p>
            )}
          </FormRow>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Account section — read-only login identity (who you are, not the business)
// ---------------------------------------------------------------------------

function AccountSection() {
  const dashboard = useDashboardOptional();
  const name = dashboard?.impersonation.actorName?.trim() || "You";
  const email = dashboard?.impersonation.actorEmail || null;
  const isAdmin = dashboard?.impersonation.isSuperAdmin ?? false;

  return (
    <div className="rounded-xl border border-glass-border bg-glass p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-dim text-[15px] font-semibold text-accent">
          {(name[0] || "U").toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-medium text-warm-white">{name}</p>
            {isAdmin && (
              <span className="shrink-0 rounded-full bg-accent-dim px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">
                Strelva Admin
              </span>
            )}
          </div>
          {email && <p className="truncate text-[12px] text-gray-muted">{email}</p>}
        </div>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-gray-muted">
        This is the account you&apos;re signed in with. It stays the same across every
        business you can access. Your business&apos;s public details live in{" "}
        <span className="text-warm-white">Business info</span>.
      </p>
    </div>
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
      <div className="bg-critical0/10 border border-critical0/20 rounded-lg p-6 text-center">
        <p className="text-sm text-critical">Couldn&apos;t load theme data</p>
      </div>
    );
  }

  const swatches = THEME_COLOR_FIELDS.map((f) => ({
    label: f.label,
    hex: (getNestedValue(theme, f.key) as string) || "#000000",
  }));
  const displayFont = ((getNestedValue(theme, "fontDisplay") as string) || "").replace(/_/g, " ");

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[12px] text-gray-muted">Changes apply to your live site after publish.</p>
        <SaveStatusPill status={saveStatus} />
      </div>

      {/* Brand at a glance — the display face over the color set, so the brand
          reads as a whole before you edit any single token. */}
      <div className="mb-6 rounded-xl border border-glass-border bg-glass p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">Brand at a glance</p>
        <p
          className="mt-2 text-[24px] leading-tight text-warm-white"
          style={displayFont ? { fontFamily: `"${displayFont}", serif` } : undefined}
        >
          {displayFont || "Your display font"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {swatches.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 rounded-lg border border-glass-border bg-surface-base px-2.5 py-1.5"
            >
              <span className="h-4 w-4 rounded-full border border-glass-border" style={{ backgroundColor: s.hex }} />
              <span className="text-[11px] text-gray-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <h2 className="mb-2 text-[13px] font-medium text-warm-white">Typography</h2>
      <div className="rounded-lg border border-glass-border overflow-hidden mb-6">
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

      {/* Brand colors */}
      <h2 className="mb-2 text-[13px] font-medium text-warm-white">Brand colors</h2>
      <div className="rounded-lg border border-glass-border overflow-hidden">
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
                  className="h-8 w-8 rounded-lg border border-glass-border bg-surface-base p-0.5 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={hex}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  onBlur={handleBlurSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLElement).blur();
                  }}
                  className="w-28 bg-surface-base border border-glass-border rounded-lg px-3 py-2 text-[12px] text-warm-white outline-none focus:border-accent/40 transition-colors"
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
      title: "Brand Kit",
      description: "Tell Strelva about your business: what you do, your voice, and your media.",
      href: "/dashboard/brand-kit",
      icon: Sparkles,
    },
    {
      title: "Connections",
      description: "Connect the accounts Strelva manages: Google Business, reviews, booking.",
      href: "/dashboard/integrations",
      icon: Link2,
    },
    {
      title: "Photo library",
      description: "Upload and reuse real photos, logos, and files Strelva can reference in chat.",
      href: "/dashboard/assets",
      icon: ImageIcon,
    },
    {
      title: "Ownership & handoff",
      description: "Export your content and assets, request your site files, and offboard cleanly, all in the Ownership section below.",
      href: "/dashboard/settings#ownership",
      icon: Download,
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
            className="group flex items-start gap-4 rounded-xl border border-glass-border bg-glass px-4 py-4 transition-colors hover:border-accent/35"
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

const SITE_CONFIG_TABS = ["navigation", "capabilities", "components"] as const;

function SiteConfigSection() {
  const [tab, setTab] = useState<(typeof SITE_CONFIG_TABS)[number]>("navigation");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {SITE_CONFIG_TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`h-8 rounded-lg border px-3 text-[12px] capitalize transition-colors ${
              tab === item
                ? "border-accent/40 bg-accent/15 text-warm-white"
                : "border-glass-border text-gray-muted hover:text-warm-white"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
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
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    Promise.all([
      fetch(apiPath("/api/content/navigation"), { credentials: "same-origin" }).then((res) => res.ok ? res.json() : null),
      fetch(apiPath("/api/content/footer"), { credentials: "same-origin" }).then((res) => res.ok ? res.json() : null),
    ]).then(([nav, foot]) => {
      setNavigation(nav);
      setFooter(foot);
    }).catch(() => setSaveStatus("error")).finally(() => setLoading(false));
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

  if (loading) {
    return <SkeletonLine width="w-full" height="h-20" />;
  }

  if (!navigation || !footer) {
    return (
      <div className="rounded-lg border border-glass-border bg-glass px-5 py-6 text-center">
        <p className="text-[13px] font-medium text-warm-white">Navigation &amp; footer aren&apos;t editable here</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-gray-muted">
          This site&apos;s menu and footer are managed in its code. Ask Strelva in chat to change a
          link or label and we&apos;ll handle it.
        </p>
      </div>
    );
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
      <div className="rounded-lg border border-glass-border overflow-hidden">
        <div className="border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Navigation</p>
        </div>
        {navigation.menuItems.map((item, index) => (
          <div key={`${item.label}-${index}`} className="grid grid-cols-1 gap-2 border-b border-glass-border/50 px-5 py-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={item.label}
              onChange={(event) => updateNavItem(index, "label", event.target.value)}
              onBlur={() => saveContent("navigation", navigation)}
              className="rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
            />
            <input
              value={item.href}
              onChange={(event) => updateNavItem(index, "href", event.target.value)}
              onBlur={() => saveContent("navigation", navigation)}
              className="rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-accent outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const next = { ...navigation, menuItems: navigation.menuItems.filter((_, i) => i !== index) };
                setNavigation(next);
                saveContent("navigation", next);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-glass-border text-gray-muted hover:text-critical"
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
            className="inline-flex items-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-[12px] text-gray-muted hover:text-warm-white"
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
              className="rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
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
              className="rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-accent outline-none"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-glass-border overflow-hidden">
        <FormRow label="Footer tagline" description="Short footer copy">
          <textarea
            value={footer.tagline}
            onChange={(event) => {
              setFooter({ ...footer, tagline: event.target.value });
              setSaveStatus("dirty");
            }}
            onBlur={() => saveContent("footer", footer)}
            rows={2}
            className="w-full resize-none rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
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
            className="w-full rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
          />
        </FormRow>
      </div>
    </div>
  );
}

function CapabilitiesSection() {
  const apiPath = useDashboardApiPath();
  const readOnly = useDashboardOptional()?.readOnly ?? false;
  const [capabilities, setCapabilities] = useState<SiteCapabilitiesData | null>(null);
  const [loading, setLoading] = useState(true);
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
      .catch(() => setSaveStatus("error"))
      .finally(() => setLoading(false));
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

  if (loading) return <SkeletonLine width="w-full" height="h-20" />;
  if (!capabilities) {
    return (
      <div className="rounded-lg border border-glass-border bg-glass px-5 py-6 text-center">
        <p className="text-[13px] font-medium text-warm-white">Couldn&apos;t load site capabilities</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-gray-muted">
          Refresh the page to try again.
        </p>
      </div>
    );
  }

  const toggles: Array<[keyof SiteCapabilitiesData, string]> = [
    ["supportsPageConfig", "Page structure"],
    ["supportsNavigationConfig", "Navigation"],
    ["supportsFooterConfig", "Footer"],
    ["supportsDraftPreview", "Draft preview"],
    ["supportsInlineEditing", "Inline editing"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        {readOnly && (
          <span className="text-[11px] text-gray-muted">Editing is disabled in the demo</span>
        )}
        <SaveStatusPill status={saveStatus} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {toggles.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between rounded-lg border border-glass-border bg-glass px-4 py-3">
            <span className="text-[13px] text-warm-white">{label}</span>
            <input
              type="checkbox"
              checked={Boolean(capabilities[key])}
              disabled={readOnly}
              onChange={(event) => {
                const next = { ...capabilities, [key]: event.target.checked };
                setCapabilities(next);
                saveCapabilities(next);
              }}
              className="h-4 w-4 accent-accent disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      <div className="rounded-lg border border-glass-border p-4">
        <label className="text-[11px] uppercase tracking-[0.14em] text-gray-muted">Custom-only features</label>
        <input
          value={(capabilities.customOnlyFeatures || []).join(", ")}
          disabled={readOnly}
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
          className="mt-2 w-full rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none disabled:opacity-60"
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
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);

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

  const removeComponent = useCallback((index: number) => {
    const next = components.filter((_, i) => i !== index);
    setComponents(next);
    saveComponents(next);
    setConfirmRemoveIndex(null);
  }, [components, saveComponents]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-gray-muted">Admin-only custom components exposed to this site manifest.</p>
        <SaveStatusPill status={saveStatus} />
      </div>
      {error && <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-[12px] text-warning">{error}</p>}
      <div className="space-y-3">
        {components.map((component, index) => (
          <div key={`${component.id}-${index}`} className="rounded-lg border border-glass-border bg-glass p-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-gray-faint">
              <span className="flex items-center gap-2">
                <Code2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Admin component
              </span>
              <button
                type="button"
                onClick={() => setConfirmRemoveIndex(index)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-glass-border text-gray-muted hover:text-critical"
                aria-label="Remove component"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
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
                className="rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-accent outline-none"
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
                className="rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[12px] text-warm-white outline-none"
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
        className="inline-flex items-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-[12px] text-gray-muted hover:text-warm-white"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        Add component
      </button>

      <ConfirmDialog
        open={confirmRemoveIndex !== null}
        title="Remove this component?"
        message="This admin component will be removed from the site manifest."
        confirmLabel="Remove"
        destructive
        busy={saveStatus === "saving"}
        onConfirm={() => {
          if (confirmRemoveIndex !== null) removeComponent(confirmRemoveIndex);
        }}
        onCancel={() => setConfirmRemoveIndex(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dependency health section
// ---------------------------------------------------------------------------

const DEPENDENCY_STATUS_COPY: Record<string, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "border-positive/30 bg-positive/10 text-positive" },
  degraded: { label: "Degraded", className: "border-warning/30 bg-warning/10 text-warning" },
  paused: { label: "Paused", className: "border-critical/30 bg-critical/10 text-critical" },
  failing: { label: "Failing", className: "border-critical/30 bg-critical/10 text-critical" },
  unknown: { label: "Unknown", className: "border-glass-border text-gray-faint" },
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
      <div className="rounded-lg border border-critical/20 bg-critical/10 p-4 text-[12px] text-critical">
        {error}
      </div>
    );
  }

  if (!data) return <SkeletonLine width="w-full" height="h-24" />;

  if (data.deliveryModel !== "custom_repo") {
    return (
      <div className="rounded-lg border border-glass-border bg-glass p-4">
        <p className="text-[13px] text-warm-white">No connected services to monitor</p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
          This site doesn&apos;t rely on any outside services we need to keep an eye on.
        </p>
      </div>
    );
  }

  const hasDependencies = data.dependencies.length > 0;

  return (
    <div className="space-y-4">
      {data.hasBlockingDependency && (
        <div className="rounded-lg border border-warning/25 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.7} />
            <div>
              <p className="text-[13px] font-medium text-warning">
                A custom repo dependency needs attention before the client site depends on it.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-warning/80">
                Strelva is showing this here so paused services are caught before they look like a storefront or AI issue.
              </p>
            </div>
          </div>
        </div>
      )}

      {!hasDependencies && (
        <div className="rounded-lg border border-glass-border bg-glass p-4">
          <p className="text-[13px] text-warm-white">No external dependencies recorded</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
            Add dependencies to the tenant custom repo metadata as they become operationally important.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {data.dependencies.map((dependency) => (
          <div key={dependency.id} className="rounded-lg border border-glass-border bg-glass p-4">
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
    className: "bg-positive/10 text-positive",
    note: "Everything included. Cancel anytime.",
  },
  trialing: {
    label: "Trialing",
    className: "bg-accent/10 text-accent",
    note: "Trial access is active.",
  },
  past_due: {
    label: "Past due",
    className: "bg-warning/10 text-warning",
    note: "Payment needs attention to keep the dashboard fully available.",
  },
  cancelled: {
    label: "Canceled",
    className: "bg-critical/10 text-critical",
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
  className: "bg-warning/12 text-warning",
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
    <div className="rounded-lg border border-glass-border overflow-hidden">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium tracking-[0.14em] uppercase text-gray-muted mb-2">
            Current plan
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[20px] font-medium text-warm-white">
              {isFounderComp ? "Founder comp" : SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL}
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${copy.className}`}>
              {copy.label}
            </span>
          </div>
          <p className="text-[12px] text-gray-faint">
            {copy.note}
          </p>
          {!isFounderComp && dashboard?.hasStripeCustomer && (
            <p className="mt-1 text-[12px] text-gray-faint">
              Manage billing opens your secure Stripe portal to update payment, change plan, or cancel.
            </p>
          )}
          {billingError && (
            <p className="mt-3 text-[12px] text-warning">{billingError}</p>
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
                    ? "You're on a managed plan. There's no billing portal to open. Message Strelva anytime about your plan."
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
          className="min-h-[38px] w-full rounded-lg border border-glass-border px-4 py-2 text-[12px] text-gray-muted transition-colors hover:bg-glass disabled:opacity-60 sm:w-auto"
        >
          {isFounderComp ? "No billing action" : openingPortal ? "Opening..." : "Manage billing"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Section headers
// ---------------------------------------------------------------------------

const SECTION_META: Record<string, { title: string; description: string }> = {
  business: {
    title: "Business",
    description: "Everything about your site: details, branding, structure, connected services, and quick tools.",
  },
  account: {
    title: "Account",
    description: "Your personal details on this dashboard, separate from the business you manage.",
  },
  domains: {
    title: "Domain health",
    description: "Production and admin domains, DNS records, SSL state, and repair steps.",
  },
  plan: {
    title: "Plan",
    description: "One plan, one operating cost, no maintenance upsells.",
  },
};

// ---------------------------------------------------------------------------
// In-page section eyebrow — labels each consolidated group inside Business.
// ---------------------------------------------------------------------------

const BUSINESS_SECTION_META: { id: (typeof BUSINESS_ANCHORS)[number]; eyebrow: string; description: string }[] = [
  {
    id: "profile",
    eyebrow: "Business info",
    description: "Your business name, tagline, and the primary action visitors should take.",
  },
  {
    id: "branding",
    eyebrow: "Branding",
    description: "The fonts and colors that define how your site looks.",
  },
  {
    id: "site-config",
    eyebrow: "Site config",
    description: "Design tokens, navigation, footer content, supported capabilities, and custom components.",
  },
  {
    id: "dependencies",
    eyebrow: "Connected services",
    description: "Outside services your site relies on. Anything paused or failing is flagged before it can affect your site.",
  },
  {
    id: "utilities",
    eyebrow: "Shortcuts",
    description: "Useful tools that support Strelva, exports, and connection setup.",
  },
  {
    id: "ownership",
    eyebrow: "Ownership & handoff",
    description: "Know what the business owns, what Strelva manages, and how to leave cleanly.",
  },
];

function SettingsGroup({
  id,
  eyebrow,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="mb-5 border-b border-glass-border pb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">{eyebrow}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-gray-faint">{description}</p>
      </div>
      {children}
    </section>
  );
}

function BusinessSettings({
  settings,
  setSettings,
  readOnly,
}: {
  settings: SettingsData | null;
  setSettings: (s: SettingsData) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-14">
      {BUSINESS_SECTION_META.map((section) => (
        <SettingsGroup
          key={section.id}
          id={section.id}
          eyebrow={section.eyebrow}
          description={section.description}
        >
          {section.id === "profile" &&
            (settings ? (
              <ProfileSection
                settings={settings}
                setSettings={setSettings}
                fields={BUSINESS_FIELDS}
                readOnly={readOnly}
              />
            ) : (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 bg-glass rounded-lg" />
                ))}
              </div>
            ))}
          {section.id === "branding" && <BrandSection />}
          {section.id === "site-config" && <SiteConfigSection />}
          {section.id === "dependencies" && <DependencyHealthSection />}
          {section.id === "utilities" && <UtilitiesSection />}
          {section.id === "ownership" && <OwnershipSection />}
        </SettingsGroup>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("business");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const apiPath = useDashboardApiPath();
  const readOnly = useDashboardOptional()?.readOnly ?? false;

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
      const raw = window.location.hash.replace("#", "");
      if (!raw) {
        setActiveSection("business");
        return;
      }
      // A current top-level id wins outright; otherwise fall back to the legacy
      // hash map, defaulting anything unknown to the Business group.
      const isTopLevel = SETTINGS_SECTIONS.some((item) => item.id === raw);
      const section = isTopLevel ? raw : LEGACY_HASH_TO_SECTION[raw] ?? "business";
      setActiveSection(section);

      // Old business sub-hashes (e.g. #profile, #ownership) scroll to their
      // in-page anchor now that those sections live inside Business.
      if (section === "business" && (BUSINESS_ANCHORS as readonly string[]).includes(raw)) {
        window.setTimeout(() => {
          document.getElementById(raw)?.scrollIntoView({ block: "start" });
        }, 60);
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
          <p className="text-sm text-critical mb-3">Couldn&apos;t load settings</p>
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
            className="px-4 py-2 rounded-lg border border-glass-border text-xs text-gray-muted hover:bg-glass transition-colors"
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
      <nav className="w-[200px] shrink-0 border-r border-glass-border p-6 pt-8 space-y-1 hidden md:block">
        <div className="text-[11px] font-medium tracking-[0.14em] uppercase text-gray-muted mb-3 px-3">
          Settings
        </div>
        {SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`mb-1 w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors ${
              activeSection === item.id
                ? "border-glass-border bg-glass text-warm-white"
                : "border-transparent text-gray-muted hover:border-glass-border/60 hover:bg-glass/50 hover:text-warm-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Mobile section select */}
      <div className="shrink-0 border-b border-glass-border px-4 py-3 md:hidden">
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
        <div className={activeSection === "business" ? "max-w-3xl" : "max-w-2xl"}>
          {/* Section header — each tab owns its own framing now (no generic banner). */}
          {meta && (
            <div className="mb-8">
              <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">{meta.title}</h1>
              <p className="text-[13px] leading-relaxed text-gray-muted mt-1.5">{meta.description}</p>
            </div>
          )}

          {/* Section content */}
          {activeSection === "business" && (
            <BusinessSettings settings={settings} setSettings={setSettings} readOnly={readOnly} />
          )}
          {activeSection === "account" && <AccountSection />}
          {activeSection === "domains" && <DomainsSection />}
          {activeSection === "plan" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}
