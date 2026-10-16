"use client";

import { useCallback, useRef, useState } from "react";
import { XaField, XaSays, XaStatus, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashNote, DashPage, DashSection } from "./xa/DashboardXa";
import { useDashboard } from "./DashboardContext";

type Settings = Record<string, string>;
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
      title="Your website's voice."
      quiet="Strelva reads these every time it writes or changes your site."
      actions={<SavePill status={status} />}
      width="narrow"
      label="Brand"
    >
      {readOnly ? <DashNote tone="quiet">You can read these. Only an owner or admin can change them.</DashNote> : null}
      <div className="flex flex-col gap-6">
        <Field readOnly={readOnly} label="Business name" value={settings.siteName ?? ""} onChange={(v) => onChange("siteName", v)} onBlur={save} />
        <Field readOnly={readOnly} label="What you do, in one line" hint="The short version a stranger understands at once." value={settings.siteTagline ?? ""} onChange={(v) => onChange("siteTagline", v)} onBlur={save} placeholder="Gentle family dentistry on Elmwood Ave" />
        <Field readOnly={readOnly} label="About your business" hint="Who you serve, what makes you different, anything Strelva should always know." value={settings.siteDescription ?? ""} onChange={(v) => onChange("siteDescription", v)} onBlur={save} multiline />
        <Field readOnly={readOnly} label="How your site should sound" hint="Strelva writes everything this way." value={settings.brandVoice ?? ""} onChange={(v) => onChange("brandVoice", v)} onBlur={save} multiline placeholder={VOICE_PLACEHOLDER} />
      </div>
      <DashSection label="Logo and photos" aside={<XaTextLink href={dashboardHref("/dashboard/assets")}>Open your photos</XaTextLink>}>
        {logoUrl ? <img src={logoUrl} alt="Your logo" className="h-14 w-auto max-w-[200px] object-contain" /> : <p className="m-0 text-[15px] text-[var(--st-text-2)]">No logo yet. Add one in your photos and Strelva uses it across the site.</p>}
      </DashSection>
      <XaSays links={[<XaTextLink key="site" href={dashboardHref("/dashboard/site")}>Open your site</XaTextLink>]}>Your services, story and page words live on the site itself. I use them together with these.</XaSays>
    </DashPage>
  );
}

function SavePill({ status }: { status: SaveStatus }) {
  if (status === "idle") return <span className="text-[13px] text-[var(--st-text-3)]">Saves when you leave a field</span>;
  const copy = { saving: "Saving", saved: "Saved", error: "Didn't save. Try again." };
  return <span role={status === "error" ? "alert" : "status"} aria-live={status === "error" ? "assertive" : "polite"}><XaStatus kind={status === "error" ? "down" : status === "saved" ? "live" : "working"} size="sm">{copy[status]}</XaStatus></span>;
}
