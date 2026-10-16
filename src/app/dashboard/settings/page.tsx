"use client";

import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import Link from "next/link";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { getCurrentPlanDisplay } from "@/components/dashboard/billing-display";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { OwnershipSection } from "@/components/dashboard/OwnershipSection";
import { ContentAutonomyPanel } from "@/components/dashboard/ContentAutonomyPanel";
import { DomainsClient } from "./DomainsClient";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaField, XaHeadline, XaInitial, XaRow, XaRows, XaSegmented, XaStatus, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashEmpty, DashNote, dashStyles as dash } from "@/components/dashboard/xa/DashboardXa";
import type { CustomRepoExternalDependency } from "@/lib/types";

/*
 * Business details (/dashboard/settings) in XA. Every field says what it is
 * once: a helper appears only when it adds something the label does not.
 * Facts about the business live here; how the site sounds and looks (tagline,
 * description, voice, logo, colors, fonts) lives in Website > Brand, so each
 * field has one home. Status shows only as an exception.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsData = Record<string, string>;
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
// Business facts
// ---------------------------------------------------------------------------

type IdentityField = {
  key: string;
  label: string;
  /** Only when it says something the label does not. */
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
};

/** The business's facts. Tagline and description are words on the site: they live in Brand. */
const BUSINESS_FIELDS: readonly IdentityField[] = [
  { key: "siteName", label: "Business name" },
  { key: "ownerName", label: "Owner name", hint: "Who Strelva and your agency write to about the business." },
  {
    key: "businessModel",
    label: "How customers reach you",
    hint: "Your Google listing and reviews show here only for a local business.",
    options: [
      { value: "", label: "Let Strelva decide from your site" },
      { value: "local", label: "They visit you, or you serve an area" },
      { value: "online", label: "Online only" },
      { value: "hybrid", label: "Both" },
    ],
  },
  { key: "bookingUrl", label: "Where your main button goes", hint: "The page or booking link your site's main button opens.", placeholder: "https://" },
];

// ---------------------------------------------------------------------------
// Settings sections
// ---------------------------------------------------------------------------

// Four top-level groups (labels pending Jacob: "You", "Web addresses").
const SETTINGS_SECTIONS = [
  { id: "business", label: "Business" },
  { id: "account", label: "You" },
  { id: "domains", label: "Web addresses" },
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

/** Said only when something happened: nothing at rest. */
function SaveStatusWord({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "dirty") return <XaStatus kind="waits" size="sm">Not saved yet</XaStatus>;
  if (status === "saving") return <XaStatus kind="working" size="sm">Saving</XaStatus>;
  if (status === "saved") return <XaStatus kind="live" size="sm">Saved</XaStatus>;
  return <XaStatus kind="down" size="sm">Didn&apos;t save</XaStatus>;
}

const selectClass = "min-h-[44px] w-full rounded-[var(--st-r-md)] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)] disabled:opacity-60";

function XaSelectField({ label, hint, value, onChange, options, disabled }: { label: string; hint?: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return <label className="flex flex-col gap-2">
    <span className="text-[13px] font-medium text-[var(--st-text-body)]">{label}</span>
    <select className={selectClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {hint ? <span className="text-[13px] leading-[18px] text-[var(--st-text-3)]">{hint}</span> : null}
  </label>;
}

function ProfileSection({
  settings,
  setSettings,
  readOnly = false,
}: {
  settings: SettingsData;
  setSettings: (s: SettingsData) => void;
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

  const handleChange = useCallback((key: string, value: string) => {
    const updated = { ...latestRef.current, [key]: value };
    setSettings(updated);
    latestRef.current = updated;
    setSaveStatus("dirty");
  }, [setSettings]);

  const validateField = useCallback((key: string, value: string): string => {
    const trimmed = value.trim();
    if (key === "siteName" && !trimmed) return "Your business needs a name.";
    if (key === "bookingUrl" && trimmed && !/^https?:\/\/\S+/i.test(trimmed)) return "Enter the full address, starting with https://";
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
    if (message) return; // Don't persist an invalid field; say what is wrong beside it.
    saveSettings(latestRef.current);
  }, [saveSettings, validateField]);

  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      {readOnly || saveStatus !== "idle" ? <p className="m-0 flex items-center gap-3 text-[13px] text-[var(--st-text-3)]">{readOnly ? "Editing is off in the demo." : null}<SaveStatusWord status={saveStatus} /></p> : null}
      {BUSINESS_FIELDS.map((field) => field.options ? (
        <XaSelectField key={field.key} label={field.label} hint={field.hint} value={settings[field.key] || ""} disabled={readOnly} options={field.options}
          onChange={(value) => { handleChange(field.key, value); saveSettings(latestRef.current); }} />
      ) : (
        <XaField key={field.key} label={field.label} hint={field.hint} error={fieldErrors[field.key]} placeholder={field.placeholder}
          value={settings[field.key] || ""} disabled={readOnly}
          onChange={(event) => handleChange(field.key, event.target.value)}
          onBlur={() => handleBlurSave(field.key)}
          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLElement).blur(); }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// You: the login, separate from the business
// ---------------------------------------------------------------------------

function AccountSection() {
  const dashboard = useDashboardOptional();
  const name = dashboard?.impersonation.actorName?.trim() || "You";
  const email = dashboard?.impersonation.actorEmail || null;
  const isAdmin = dashboard?.impersonation.isSuperAdmin ?? false;
  return (
    <div className="flex flex-col gap-4">
      <XaRows label="Your sign-in">
        <XaRow lead={<XaInitial name={name} shape="round" size={36} />} title={name} detail={[email, isAdmin ? "Strelva admin" : null].filter(Boolean).join(" · ") || undefined} />
      </XaRows>
      <p className="m-0 max-w-[560px] text-[15px] leading-[1.5] text-[var(--st-text-2)]">You sign in with this on every business you can open. The business&apos;s own details are under Business.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu and footer
// ---------------------------------------------------------------------------

function NavigationFooterSection({ readOnly = false }: { readOnly?: boolean }) {
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

  if (loading) return <div className="flex flex-col gap-3" aria-busy="true"><StSkeleton width="60%" label="Loading your menu" /><StSkeleton width="45%" label="Loading your menu" /></div>;

  if (!navigation || !footer) {
    return <p className="m-0 max-w-[560px] text-[15px] leading-[1.5] text-[var(--st-text-2)]">Your site&apos;s menu and footer are part of its code. Ask Strelva to change a link or a word and it handles it.</p>;
  }

  const updateNavItem = (index: number, key: "label" | "href", value: string) => {
    setNavigation({ ...navigation, menuItems: navigation.menuItems.map((item, i) => i === index ? { ...item, [key]: value } : item) });
    setSaveStatus("dirty");
  };

  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      {saveStatus !== "idle" ? <p className="m-0 text-[13px]"><SaveStatusWord status={saveStatus} /></p> : null}
      <ul className={dash.list} aria-label="Menu links">
        {navigation.menuItems.map((item, index) => (
          <li key={index} className="!flex-wrap">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <XaField label="Link words" value={item.label} disabled={readOnly} onChange={(event) => updateNavItem(index, "label", event.target.value)} onBlur={() => saveContent("navigation", navigation)} />
              <XaField label="Opens" value={item.href} disabled={readOnly} onChange={(event) => updateNavItem(index, "href", event.target.value)} onBlur={() => saveContent("navigation", navigation)} />
            </div>
            {!readOnly ? <div className={dash.listEnd}><XaTextLink onClick={() => { const next = { ...navigation, menuItems: navigation.menuItems.filter((_, i) => i !== index) }; setNavigation(next); saveContent("navigation", next); }} aria-label={`Remove ${item.label || "this link"} from the menu`}>Remove</XaTextLink></div> : null}
          </li>
        ))}
      </ul>
      {!readOnly ? <p className="m-0 text-[14px]"><XaTextLink onClick={() => { const next = { ...navigation, menuItems: [...navigation.menuItems, { label: "New link", href: "/" }] }; setNavigation(next); saveContent("navigation", next); }}>Add a link to the menu</XaTextLink></p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <XaField label="Main button words" value={navigation.ctaLabel} disabled={readOnly} placeholder="Book a visit"
          onChange={(event) => { setNavigation({ ...navigation, ctaLabel: event.target.value }); setSaveStatus("dirty"); }} onBlur={() => saveContent("navigation", navigation)} />
        <XaField label="Main button opens" value={navigation.ctaHref} disabled={readOnly} placeholder="/book"
          onChange={(event) => { setNavigation({ ...navigation, ctaHref: event.target.value }); setSaveStatus("dirty"); }} onBlur={() => saveContent("navigation", navigation)} />
      </div>
      <XaTextArea label="Footer line" rows={2} value={footer.tagline} disabled={readOnly}
        onChange={(event) => { setFooter({ ...footer, tagline: event.target.value }); setSaveStatus("dirty"); }} onBlur={() => saveContent("footer", footer)} />
      <XaField label="Copyright line" value={footer.copyrightText} disabled={readOnly}
        onChange={(event) => { setFooter({ ...footer, copyrightText: event.target.value }); setSaveStatus("dirty"); }} onBlur={() => saveContent("footer", footer)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strelva-only: what this site's code supports (admins only)
// ---------------------------------------------------------------------------

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

  if (loading) return <StSkeleton width="50%" label="Loading what the site supports" />;
  if (!capabilities) return <DashNote tone="down">What this site supports didn&apos;t load. Reload to try again.</DashNote>;

  const toggles: Array<[keyof SiteCapabilitiesData, string]> = [
    ["supportsPageConfig", "Pages can be rearranged here"],
    ["supportsNavigationConfig", "The menu can be changed here"],
    ["supportsFooterConfig", "The footer can be changed here"],
    ["supportsDraftPreview", "Changes can be previewed before they go live"],
    ["supportsInlineEditing", "Words can be changed in place on the page"],
  ];

  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      {saveStatus !== "idle" ? <p className="m-0 text-[13px]"><SaveStatusWord status={saveStatus} /></p> : null}
      <ul className={dash.list} aria-label="What this site supports">
        {toggles.map(([key, label]) => (
          <li key={key}>
            <label className="flex min-h-[28px] flex-1 cursor-pointer items-center justify-between gap-4 text-[15px] text-[var(--st-text)]">
              <span>{label}</span>
              <input type="checkbox" checked={Boolean(capabilities[key])} disabled={readOnly} className="h-4 w-4 accent-[var(--st-accent)]"
                onChange={(event) => { const next = { ...capabilities, [key]: event.target.checked }; setCapabilities(next); saveCapabilities(next); }} />
            </label>
          </li>
        ))}
      </ul>
      <XaField label="Things only this site's code does" hint="Separate with commas, for example: cart, rewards, booking flow." value={(capabilities.customOnlyFeatures || []).join(", ")} disabled={readOnly}
        onChange={(event) => { setCapabilities({ ...capabilities, customOnlyFeatures: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }); setSaveStatus("dirty"); }}
        onBlur={() => saveCapabilities(capabilities)} />
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
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Only Strelva admins can see these.")))
      .then((data) => setComponents(data.components || []))
      .catch((err) => setError(err instanceof Error ? err.message : "The site's own parts didn't load."));
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
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "That didn't save.");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("error");
      setError(err instanceof Error ? err.message : "That didn't save.");
    }
  }, [apiPath, tenantId]);

  const update = (index: number, key: "id" | "label", value: string) => {
    setComponents(components.map((item, i) => i === index ? { ...item, [key]: value } : item));
    setSaveStatus("dirty");
  };

  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      {saveStatus !== "idle" ? <p className="m-0 text-[13px]"><SaveStatusWord status={saveStatus} /></p> : null}
      {error ? <DashNote tone="down" role="alert">{error}</DashNote> : null}
      {components.length ? <ul className={dash.list} aria-label="Parts made only for this site">
        {components.map((component, index) => (
          <li key={index} className="!flex-wrap">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <XaField label="Name in the code" value={component.id} onChange={(event) => update(index, "id", event.target.value)} onBlur={() => saveComponents(components)} />
              <XaField label="Name people see" value={component.label} onChange={(event) => update(index, "label", event.target.value)} onBlur={() => saveComponents(components)} />
            </div>
            <div className={dash.listEnd}><XaTextLink onClick={() => setConfirmRemoveIndex(index)} aria-label={`Remove ${component.label}`}>Remove</XaTextLink></div>
          </li>
        ))}
      </ul> : !error ? <p className="m-0 text-[15px] text-[var(--st-text-2)]">No parts made only for this site yet.</p> : null}
      <p className="m-0 text-[14px]"><XaTextLink onClick={() => { const next = [...components, { id: "custom-component", label: "Custom part", adminOnly: true }]; setComponents(next); saveComponents(next); }}>Add a part</XaTextLink></p>
      <ConfirmDialog open={confirmRemoveIndex !== null} title={`Remove ${confirmRemoveIndex !== null ? components[confirmRemoveIndex]?.label ?? "this part" : "this part"}?`}
        message="The site stops offering it to Strelva. The code that draws it stays in the site's repo." confirmLabel="Remove it" cancelLabel="Keep it" destructive busy={saveStatus === "saving"}
        onConfirm={() => { if (confirmRemoveIndex !== null) { const next = components.filter((_, i) => i !== confirmRemoveIndex); setComponents(next); saveComponents(next); setConfirmRemoveIndex(null); } }}
        onCancel={() => setConfirmRemoveIndex(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outside services the site depends on: exceptions first
// ---------------------------------------------------------------------------

const DEPENDENCY_WORDS: Record<string, { kind: "waits" | "down" | null; word: string }> = {
  healthy: { kind: null, word: "Working" },
  degraded: { kind: "waits", word: "Slow or partly working" },
  paused: { kind: "down", word: "Paused" },
  failing: { kind: "down", word: "Not working" },
  unknown: { kind: "waits", word: "Not checked yet" },
};

function DependencyHealthSection() {
  const apiPath = useDashboardApiPath();
  const [data, setData] = useState<DependencyHealthData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(apiPath("/api/custom-repo/dependencies"), { credentials: "same-origin" })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((next) => { setError(""); setData(next); })
      .catch(() => setError("Strelva couldn't check the outside services just now."));
  }, [apiPath]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (error) return <DashNote tone="down" links={[<XaTextLink key="again" onClick={load}>Check again</XaTextLink>]}>{error}</DashNote>;
  if (!data) return <StSkeleton width="50%" label="Checking outside services" />;
  if (data.deliveryModel !== "custom_repo" || data.dependencies.length === 0) {
    return <p className="m-0 max-w-[560px] text-[15px] leading-[1.5] text-[var(--st-text-2)]">Your site doesn&apos;t rely on any outside service Strelva needs to watch.</p>;
  }
  const trouble = data.dependencies.filter((dependency) => (DEPENDENCY_WORDS[dependency.status] ?? DEPENDENCY_WORDS.unknown!).kind);
  const fine = data.dependencies.length - trouble.length;
  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      <p className="m-0 text-[15px] leading-[1.5] text-[var(--st-text-body)]">
        {trouble.length === 0 ? `All ${data.dependencies.length} outside services your site uses are working.`
          : `${trouble.length === 1 ? "One outside service needs" : `${trouble.length} outside services need`} a look${fine ? `; the other ${fine} ${fine === 1 ? "is" : "are"} working` : ""}. Strelva flags it here so it isn't mistaken for a problem with your site.`}
      </p>
      {trouble.length ? <XaRows label="Outside services that need a look">
        {trouble.map((dependency) => {
          const words = DEPENDENCY_WORDS[dependency.status] ?? DEPENDENCY_WORDS.unknown!;
          return <XaRow key={dependency.id} title={dependency.name} detail={`${words.word}. ${dependency.purpose}${dependency.notes ? ` ${dependency.notes}` : ""}`} tone="waits"
            action={dependency.actionUrl ? <a className="text-[14px] font-medium text-[var(--st-accent)] hover:underline" href={dependency.actionUrl} target="_blank" rel="noreferrer">Open {dependency.provider}</a> : undefined} />;
        })}
      </XaRows> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan: no price until ADR 0017's numbers are decided; status only as an exception
// ---------------------------------------------------------------------------

function BillingSection() {
  const dashboard = useDashboardOptional();
  const apiPath = useDashboardApiPath();
  const [billingError, setBillingError] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);
  const status = dashboard?.subscriptionStatus ?? "none";
  const isFounderComp = dashboard?.planOverride === "founder_comp";
  // ADR 0017 (live Systems + jar) has its numbers pending Jacob's 14-day test,
  // so the plan shows by name only: monthly cents 0 drops the price line.
  const currentPlan = getCurrentPlanDisplay({
    status,
    isFounderComp,
    commercialPlanLabel: dashboard?.commercialPlanLabel ?? "Managed plan",
    commercialPlanMonthlyCents: 0,
  });
  const canPortal = !isFounderComp && status !== "none";

  async function openPortal() {
    setBillingError("");
    setOpeningPortal(true);
    try {
      const res = await fetch(apiPath("/api/billing/portal"), { method: "POST", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBillingError(res.status === 404 || !dashboard?.hasStripeCustomer
          ? "Your plan is managed by Strelva, so there's no billing page to open. Write to Strelva about it any time."
          : body?.error || "The billing page didn't open. Try again.");
        return;
      }
      if (body.portalUrl) window.open(body.portalUrl, "_blank");
    } catch {
      setBillingError("The billing page didn't open. Check your connection and try again.");
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-5">
      <XaRows label="Your plan">
        <XaRow title={currentPlan}
          detail={isFounderComp ? "Comped for this founding business. Nothing is due." : status === "trialing" ? "On a trial." : status === "cancelled" ? "Your plan has ended." : status === "none" ? "No plan is connected yet." : "Your website and Google listing, kept up by Strelva."}
          tone={status === "past_due" || status === "cancelled" ? "waits" : undefined}
          action={canPortal ? <XaButton busy={openingPortal} onClick={() => void openPortal()}>Manage billing</XaButton> : undefined} />
      </XaRows>
      {/* The payment decision sits beside the plan it changes. */}
      <BillingBanner />
      {canPortal && dashboard?.hasStripeCustomer ? <p className="m-0 text-[14px] leading-[1.5] text-[var(--st-text-2)]">Manage billing opens Stripe, where you see what you pay, change your card, or cancel.</p> : null}
      {billingError ? <p className="m-0 text-[14px] text-[var(--st-need)]" role="alert">{billingError}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DomainsSection() {
  return <DomainsClient initialDomains={[]} />;
}

const SECTION_META: Record<string, { title: string; quiet?: string }> = {
  business: { title: "Said once, here.", quiet: "Your site, your Google listing and Strelva all read these." },
  account: { title: "You." },
  domains: { title: "Your web addresses." },
  plan: { title: "Your plan." },
};

/** Parts of Business, each a label and its fields: no description restating the label. */
const BUSINESS_PARTS: { id: (typeof BUSINESS_ANCHORS)[number]; label: string; adminOnly?: boolean }[] = [
  { id: "profile", label: "About the business" },
  { id: "branding", label: "Who can change your site" },
  { id: "site-config", label: "Menu and footer" },
  { id: "dependencies", label: "Outside services" },
  { id: "utilities", label: "Also yours to change" },
  { id: "ownership", label: "What you own, and leaving" },
];

function SettingsGroup({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-8 flex-col gap-4" aria-labelledby={`${id}-label`}>
      <h2 id={`${id}-label`} className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">{label}</h2>
      {children}
    </section>
  );
}

function UtilitiesSection() {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const links = [
    { title: "How your site sounds and looks", href: "/dashboard/brand-kit" },
    { title: "Connections", href: "/dashboard/integrations" },
    { title: "Photos", href: "/dashboard/assets" },
    { title: "What you own, and leaving", href: "/dashboard/settings#ownership" },
  ];
  return (
    <p className="m-0 text-[15px] leading-[1.6] text-[var(--st-text-body)]">
      {links.map((item, index) => (
        <span key={item.href}>
          {index ? " · " : ""}
          <Link href={dashboardHref(item.href)} className="font-medium text-[var(--st-accent)] hover:underline">{item.title}</Link>
        </span>
      ))}
    </p>
  );
}

function BusinessSettings({ settings, setSettings, readOnly }: { settings: SettingsData | null; setSettings: (s: SettingsData) => void; readOnly: boolean }) {
  const isAdmin = useDashboardOptional()?.impersonation.isSuperAdmin ?? false;
  const label = (id: (typeof BUSINESS_ANCHORS)[number]) => BUSINESS_PARTS.find((part) => part.id === id)!.label;
  return (
    <div className="flex flex-col gap-14">
      <SettingsGroup id="profile" label={label("profile")}>
        {settings ? <ProfileSection settings={settings} setSettings={setSettings} readOnly={readOnly} />
          : <div className="flex flex-col gap-3" aria-busy="true">{[72, 64, 80, 56].map((w) => <StSkeleton key={w} width={`${w}%`} label="Loading business details" />)}</div>}
      </SettingsGroup>
      <SettingsGroup id="branding" label={label("branding")}><ContentAutonomyPanel /></SettingsGroup>
      <SettingsGroup id="site-config" label={label("site-config")}><NavigationFooterSection readOnly={readOnly} /></SettingsGroup>
      {isAdmin ? <SettingsGroup id="site-code" label="What this site's code supports (Strelva only)"><CapabilitiesSection /><CustomComponentsSection /></SettingsGroup> : null}
      <SettingsGroup id="dependencies" label={label("dependencies")}><DependencyHealthSection /></SettingsGroup>
      <SettingsGroup id="utilities" label={label("utilities")}><UtilitiesSection /></SettingsGroup>
      <SettingsGroup id="ownership" label={label("ownership")}><OwnershipSection /></SettingsGroup>
    </div>
  );
}

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

  const retry = () => {
    setLoadError(false);
    fetch(apiPath("/api/content/settings"), { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setSettings(data))
      .catch(() => setLoadError(true));
  };

  if (loadError) {
    return (
      <DashEmpty pose="fixing" title="Your business details didn't load." job="Nothing about your business changed" action={<XaButton variant="primary" onClick={retry}>Try again</XaButton>}>
        Strelva couldn&apos;t read them just now. Trying again usually fixes it.
      </DashEmpty>
    );
  }

  const meta = SECTION_META[activeSection];

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <div className={dash.page}>
        <div className={dash.column} style={{ maxWidth: activeSection === "business" ? 820 : 680 }}>
          <header className="flex flex-col gap-6">
            <div className="self-start"><XaSegmented label="Business details" value={activeSection as (typeof SETTINGS_SECTIONS)[number]["id"]} onChange={setSection}
              options={SETTINGS_SECTIONS.map((item) => ({ value: item.id, label: item.label }))} /></div>
            {meta ? <XaHeadline size="sm" quiet={meta.quiet}>{meta.title}</XaHeadline> : null}
          </header>

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
