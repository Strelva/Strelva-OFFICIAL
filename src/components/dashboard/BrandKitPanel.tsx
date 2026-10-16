"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XaField, XaSays, XaStatus, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashNote, DashPage, DashSection } from "./xa/DashboardXa";
import { useDashboard } from "./DashboardContext";

type Settings = Record<string, string>;
type Theme = Record<string, unknown>;

const FONT_OPTIONS = ["Fraunces", "Instrument_Serif", "Playfair_Display", "DM_Serif_Display", "Inter", "DM_Sans", "Manrope", "Work_Sans"];
/** The site's five colors, named by what each one paints. */
const COLOR_FIELDS: { key: string; label: string }[] = [
  { key: "cream", label: "Background" },
  { key: "bark", label: "Words" },
  { key: "sage", label: "Buttons and links" },
  { key: "terra", label: "Highlights" },
  { key: "wheat", label: "Soft panels" },
];

/**
 * How the site looks: two fonts and five colors, saved as you change them and
 * shown in place (a swatch beside its name), not as a style-guide grid.
 */
function LookSection({ readOnly }: { readOnly: boolean }) {
  const { dashboardHref } = useDashboard();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const latest = useRef<Theme | null>(null);

  useEffect(() => {
    fetch(dashboardHref("/api/content/theme"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { setTheme(data); latest.current = data; })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [dashboardHref]);

  const save = useCallback(async () => {
    if (readOnly || !latest.current) return;
    setStatus("saving");
    try {
      const res = await fetch(dashboardHref("/api/content/theme"), { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(latest.current) });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }, [dashboardHref, readOnly]);

  const set = (key: string, value: string, now = false) => {
    if (!latest.current) return;
    const next = key.startsWith("colors.")
      ? { ...latest.current, colors: { ...((latest.current.colors as Record<string, unknown>) ?? {}), [key.slice(7)]: value } }
      : { ...latest.current, [key]: value };
    latest.current = next;
    setTheme(next);
    if (now) void save();
  };

  if (!loaded) return <p className="m-0 text-[15px] text-[var(--st-text-2)]">Reading your site&apos;s colors and fonts</p>;
  if (!theme) return <DashNote tone="quiet">This site&apos;s colors and fonts are part of its code. Ask Strelva to change them.</DashNote>;
  const colors = (theme.colors as Record<string, string> | undefined) ?? {};
  const font = (key: string) => String(theme[key] ?? "");
  const fontOptions = (current: string) => [...(current && !FONT_OPTIONS.includes(current) ? [current] : []), ...FONT_OPTIONS];
  const selectClass = "min-h-[44px] w-full rounded-[var(--st-r-md)] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)] disabled:opacity-60";

  return <div className="flex flex-col gap-5">
    {status !== "idle" ? <SavePill status={status} /> : null}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[["fontDisplay", "Headline font"], ["fontBody", "Body font"]].map(([key, label]) => <label key={key} className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-[var(--st-text-body)]">{label}</span>
        <select className={selectClass} disabled={readOnly} value={font(key!)} onChange={(event) => set(key!, event.target.value, true)}>
          {fontOptions(font(key!)).map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
        </select>
      </label>)}
    </div>
    <ul className="m-0 flex list-none flex-col p-0" aria-label="Your site's colors">
      {COLOR_FIELDS.map((field) => {
        const hex = colors[field.key] || "#000000";
        return <li key={field.key} className="flex items-center gap-3 border-t border-[var(--st-line)] py-3 first:border-t-0">
          <input type="color" aria-label={`${field.label} color`} value={hex} disabled={readOnly} onChange={(event) => set(`colors.${field.key}`, event.target.value)} onBlur={() => void save()}
            className="h-8 w-8 shrink-0 cursor-pointer rounded-full border border-[var(--st-line)] bg-transparent p-0 disabled:cursor-default" />
          <span className="flex-1 text-[15px] text-[var(--st-text)]">{field.label}</span>
          <input aria-label={`${field.label} color code`} value={hex} disabled={readOnly} onChange={(event) => set(`colors.${field.key}`, event.target.value)} onBlur={() => void save()}
            className="w-[104px] rounded-[var(--st-r-sm)] border border-[var(--st-line)] bg-[var(--st-surface)] px-2 py-1.5 text-[14px] tabular-nums text-[var(--st-text-2)] outline-none focus-visible:border-[var(--st-accent)]" />
        </li>;
      })}
    </ul>
  </div>;
}
type SaveStatus = "idle" | "saving" | "saved" | "error";

const VOICE_PLACEHOLDER =
  "Warm and down to earth. Like a friendly neighbor, not a corporation. Short sentences, no jargon.";

function Field({
  label,
  hint,
  value,
  onChange,
  onBlur,
  multiline,
  placeholder,
  readOnly = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return multiline
    ? <XaTextArea disabled={readOnly} label={label} hint={hint} value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} rows={4} />
    : <XaField disabled={readOnly} label={label} hint={hint} value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} />;
}

export function BrandKitPanel({ initialSettings }: { initialSettings: Settings }) {
  const { dashboardHref, readOnly } = useDashboard();
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const latest = useRef<Settings>(initialSettings);

  const save = useCallback(async () => {
    if (readOnly) return;
    setStatus("saving");
    try {
      const res = await fetch(dashboardHref("/api/content/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(latest.current),
      });
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [dashboardHref, readOnly]);

  const onChange = useCallback((key: string, value: string) => {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setSettings(next);
  }, []);

  const logoUrl = settings.logoUrl?.trim();

  return (
    <DashPage
      title="How your site sounds and looks."
      quiet="Strelva reads these every time it writes or changes your site."
      actions={<SavePill status={status} />}
      width="narrow"
      label="Brand"
    >
      {readOnly ? <DashNote tone="quiet">You can read these. Only an owner or admin can change them.</DashNote> : null}
      <div className="flex flex-col gap-6">
        <Field readOnly={readOnly} label="What you do, in one line" hint="The short version a stranger understands at once." value={settings.siteTagline ?? ""} onChange={(v) => onChange("siteTagline", v)} onBlur={save} placeholder="Gentle family dentistry on Elmwood Ave" />
        <Field readOnly={readOnly} label="About your business" hint="Who you serve, what makes you different, anything Strelva should always know." value={settings.siteDescription ?? ""} onChange={(v) => onChange("siteDescription", v)} onBlur={save} multiline />
        <Field readOnly={readOnly} label="How your site should sound" hint="Strelva writes everything this way." value={settings.brandVoice ?? ""} onChange={(v) => onChange("brandVoice", v)} onBlur={save} multiline placeholder={VOICE_PLACEHOLDER} />
      </div>
      <DashSection label="Colors and fonts"><LookSection readOnly={readOnly} /></DashSection>
      <DashSection label="Logo and photos" aside={<XaTextLink href={dashboardHref("/dashboard/assets")}>Open your photos</XaTextLink>}>
        {logoUrl ? <img src={logoUrl} alt="Your logo" className="h-14 w-auto max-w-[200px] object-contain" /> : <p className="m-0 text-[15px] text-[var(--st-text-2)]">No logo yet. Add one in your photos and Strelva uses it across the site.</p>}
      </DashSection>
      <XaSays links={[<XaTextLink key="details" href={dashboardHref("/dashboard/settings")}>Business details</XaTextLink>, <XaTextLink key="site" href={dashboardHref("/dashboard/site")}>Your site</XaTextLink>]}>Your business name and owner live in Business details; your pages&apos; words live on the site. Strelva reads them together with these.</XaSays>
    </DashPage>
  );
}

function SavePill({ status }: { status: SaveStatus }) {
  if (status === "idle") return <span className="text-[13px] text-[var(--st-text-3)]">Saves when you leave a field</span>;
  const copy = { saving: "Saving", saved: "Saved", error: "Didn't save. Try again." };
  return <span role={status === "error" ? "alert" : "status"} aria-live={status === "error" ? "assertive" : "polite"}><XaStatus kind={status === "error" ? "down" : status === "saved" ? "live" : "working"} size="sm">{copy[status]}</XaStatus></span>;
}
