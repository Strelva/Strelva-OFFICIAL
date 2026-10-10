"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { StHead, StNotice, StPage, StPillLink, StSection, StState, StSurface } from "@/components/ui/strelva/Kit";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import styles from "./website-library.module.css";
import { useDashboard } from "./DashboardContext";

type Settings = Record<string, string>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

const VOICE_PLACEHOLDER =
  "e.g. Warm and down-to-earth. Talk like a friendly local, not a corporation. Short sentences, no jargon, a little personality.";

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
  return multiline ? <TextArea disabled={readOnly} label={label} helperText={hint} value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} rows={4} /> : <TextInput disabled={readOnly} label={label} helperText={hint} value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} />;
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
    <StPage>
      <StHead title="Your website’s voice" meta="What Strelva draws on to write and update your site. Changes save when you leave a field." actions={<SavePill status={status} />} />
      {readOnly ? <StNotice>You can read these details. Only an owner or admin can change them.</StNotice> : null}
      <StNotice>Strelva reads these details when preparing changes to your site.</StNotice>
      <StSurface label="Website voice and business details"><div className={styles.brandFields}>

        <Field
          readOnly={readOnly}
          label="Business name"
          value={settings.siteName ?? ""}
          onChange={(v) => onChange("siteName", v)}
          onBlur={save}
        />
        <Field
          readOnly={readOnly}
          label="What you do, in one line"
          hint="The short version a stranger would understand instantly."
          value={settings.siteTagline ?? ""}
          onChange={(v) => onChange("siteTagline", v)}
          onBlur={save}
          placeholder="Assisted stretching studio in Williamsville, NY"
        />
        <Field
          readOnly={readOnly}
          label="About your business"
          hint="Who you serve, what makes you different, anything Strelva should always know."
          value={settings.siteDescription ?? ""}
          onChange={(v) => onChange("siteDescription", v)}
          onBlur={save}
          multiline
        />
        <Field
          readOnly={readOnly}
          label="How should Strelva sound?"
          hint="Your voice and tone. Strelva writes everything this way."
          value={settings.brandVoice ?? ""}
          onChange={(v) => onChange("brandVoice", v)}
          onBlur={save}
          multiline
          placeholder={VOICE_PLACEHOLDER}
        />
      </div></StSurface>

      {/* Media */}
      <StSection title="Your media">
        <p className={styles.description}>Photos and your logo, ready for Strelva to use on the site.</p>
        <div className={styles.mediaRow}>{logoUrl ? <img src={logoUrl} alt="Logo" className={styles.mediaLogo} /> : <ImageIcon size={24} aria-label="No logo recorded" />}<StPillLink href={dashboardHref("/dashboard/assets")} variant="soft">Manage media</StPillLink></div>
      </StSection>

      <p className={styles.description}>
        Your services, story, and page copy live in{" "}
        <Link href={dashboardHref("/dashboard/site")} prefetch={false} className="font-medium text-accent underline-offset-2 hover:underline">
          Website
        </Link>
        . Strelva uses these details together.
      </p>
    </StPage>
  );
}

function SavePill({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const copy = { saving: "Saving…", saved: "Saved", error: "Could not save" };
  return <span role={status === "error" ? "alert" : "status"} aria-live={status === "error" ? "assertive" : "polite"}><StState kind={status === "error" ? "down" : status === "saved" ? "live" : "need"}>{copy[status]}</StState></span>;
}
