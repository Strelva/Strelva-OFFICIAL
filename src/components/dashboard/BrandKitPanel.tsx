"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, ArrowRight, Sparkles } from "lucide-react";
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
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls =
    "w-full rounded-lg border border-gray-border bg-surface-base px-3 py-2.5 text-[14px] text-warm-black placeholder-gray-faint outline-none transition-colors focus:border-accent/40";
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-warm-black">{label}</span>
      {hint && <span className="mt-0.5 block text-[12px] text-gray-muted">{hint}</span>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={4}
          className={`mt-2 resize-y ${cls}`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`mt-2 ${cls}`}
        />
      )}
    </label>
  );
}

export function BrandKitPanel({ initialSettings }: { initialSettings: Settings }) {
  const { dashboardHref } = useDashboard();
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const latest = useRef<Settings>(initialSettings);

  const save = useCallback(async () => {
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
  }, [dashboardHref]);

  const onChange = useCallback((key: string, value: string) => {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setSettings(next);
  }, []);

  const logoUrl = settings.logoUrl?.trim();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
            Brand Kit
          </div>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight text-warm-black">
            Teach the AI about your business
          </h1>
          <p className="mt-2 max-w-[520px] text-[14px] leading-relaxed text-gray-muted">
            This is what Strelva draws on to write and update your site. The clearer it is,
            the more every change sounds like you.
          </p>
        </div>
        <SavePill status={status} />
      </div>

      <div className="mt-7 space-y-5">
        <Field
          label="Business name"
          value={settings.siteName ?? ""}
          onChange={(v) => onChange("siteName", v)}
          onBlur={save}
        />
        <Field
          label="What you do, in one line"
          hint="The short version a stranger would understand instantly."
          value={settings.siteTagline ?? ""}
          onChange={(v) => onChange("siteTagline", v)}
          onBlur={save}
          placeholder="Assisted stretching studio in Williamsville, NY"
        />
        <Field
          label="About your business"
          hint="Who you serve, what makes you different, anything the AI should always know."
          value={settings.siteDescription ?? ""}
          onChange={(v) => onChange("siteDescription", v)}
          onBlur={save}
          multiline
        />
        <Field
          label="How should the AI sound?"
          hint="Your voice and tone — the AI writes everything this way."
          value={settings.brandVoice ?? ""}
          onChange={(v) => onChange("brandVoice", v)}
          onBlur={save}
          multiline
          placeholder={VOICE_PLACEHOLDER}
        />
      </div>

      {/* Media */}
      <section className="mt-6 rounded-xl border border-glass-border bg-surface-raised p-5">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-gray-muted" strokeWidth={1.6} />
          <h2 className="text-[14px] font-medium text-warm-black">Your media</h2>
        </div>
        <p className="mt-1 text-[13px] text-gray-muted">
          Photos, logo, and files the AI can pull into your site.
        </p>
        <div className="mt-3 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-lg border border-gray-border object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-gray-border text-gray-faint">
              <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
            </div>
          )}
          <Link
            href={dashboardHref("/dashboard/assets")}
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-border px-3 py-2 text-[13px] font-medium text-warm-black transition-colors hover:border-accent/35"
          >
            Manage media
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.7} />
          </Link>
        </div>
      </section>

      <p className="mt-5 text-[13px] text-gray-muted">
        Your services, story, and page copy live in{" "}
        <Link href={dashboardHref("/dashboard/site")} prefetch={false} className="font-medium text-accent underline-offset-2 hover:underline">
          Website
        </Link>
        . The AI uses everything here together.
      </p>
    </div>
  );
}

function SavePill({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const copy: Record<Exclude<SaveStatus, "idle">, { label: string; cls: string }> = {
    saving: { label: "Saving…", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
    saved: { label: "Saved", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
    error: { label: "Could not save", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
  };
  const item = copy[status];
  // Announce autosave outcome — there's no save button, so a non-sighted user
  // gets no other feedback that a blur-save succeeded or (critically) failed.
  return (
    <span
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${item.cls}`}
    >
      {item.label}
    </span>
  );
}
