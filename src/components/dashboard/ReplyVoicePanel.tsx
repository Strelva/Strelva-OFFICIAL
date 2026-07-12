"use client";

import { useState } from "react";
import { MessageSquare, Check, Loader2, ChevronDown, Sparkles } from "lucide-react";
import {
  REPLY_TEMPLATE_KINDS,
  type ReplyMode,
  type ReplyVoice,
  type ReplyTemplateKey,
} from "@/lib/reviews/reply-voice";

const MODES: { value: ReplyMode; label: string; blurb: string }[] = [
  { value: "auto", label: "Auto-post", blurb: "Replies post automatically — you do nothing." },
  { value: "approve", label: "Draft for me", blurb: "Each reply is written for you; you tap approve before it posts." },
  { value: "off", label: "Off", blurb: "Strelva won't touch your reviews." },
];

export function ReplyVoicePanel({ initialVoice }: { initialVoice: ReplyVoice }) {
  const [mode, setMode] = useState<ReplyMode>(initialVoice.mode);
  const [guidance, setGuidance] = useState(initialVoice.guidance);
  const [examples, setExamples] = useState<Record<ReplyTemplateKey, string>>(() => {
    const base = { praise: "", critical: "", question: "" } as Record<ReplyTemplateKey, string>;
    for (const t of initialVoice.templates) base[t.key] = t.example;
    return base;
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const templates = REPLY_TEMPLATE_KINDS.map((k) => ({ key: k.key, example: examples[k.key] })).filter(
        (t) => t.example.trim(),
      );
      const res = await fetch("/api/dashboard/reply-voice", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, guidance, templates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't save that.");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  const activeMode = MODES.find((m) => m.value === mode);

  return (
    <section className="mb-5 rounded-xl dashboard-panel p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-dim text-accent">
          <MessageSquare className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-warm-black">How Strelva answers your reviews</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-gray-muted">
            Strelva answers your reviews in your voice. {activeMode?.blurb}
          </p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => {
          const on = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                on ? "border-accent/60 bg-accent-dim" : "border-glass-border bg-glass hover:border-gray-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[13px] font-semibold ${on ? "text-warm-black" : "text-warm-black/90"}`}>{m.label}</span>
                {on && <Check className="h-4 w-4 text-accent" strokeWidth={2.4} />}
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-gray-muted">{m.blurb}</p>
            </button>
          );
        })}
      </div>

      {/* Voice editor — collapsed by default so the surface stays calm */}
      {mode !== "off" && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-glass-border bg-glass px-3.5 py-2.5 text-[13px] font-medium text-warm-black transition-colors hover:border-gray-border"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.7} />
              Tune your voice
              {(guidance || Object.values(examples).some(Boolean)) && (
                <span className="rounded-full bg-accent-dim px-2 py-0.5 text-[10.5px] font-semibold text-accent">set</span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-muted transition-transform ${open ? "" : "-rotate-90"}`} strokeWidth={2} />
          </button>

          {open && (
            <div className="mt-3 space-y-4">
              <label className="block">
                <span className="text-[12px] font-medium text-warm-black">How you sound</span>
                <span className="mt-0.5 block text-[11.5px] text-gray-muted">
                  One line on your tone &mdash; e.g. &ldquo;warm, straight-talking, we use first names and never sound corporate.&rdquo;
                </span>
                <textarea
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  rows={2}
                  maxLength={600}
                  placeholder="Friendly and down to earth. First names, no jargon, quick to thank people by name."
                  className="mt-1.5 w-full resize-none rounded-lg border border-glass-border bg-glass px-3 py-2 text-[13px] text-warm-black placeholder:text-gray-faint focus:border-accent/50 focus:outline-none"
                />
              </label>

              <div className="space-y-3">
                <span className="text-[12px] font-medium text-warm-black">Example replies</span>
                <span className="-mt-2 block text-[11.5px] text-gray-muted">
                  Write one reply the way you&rsquo;d actually say it for each type. Strelva mirrors the tone &mdash; never copies the words.
                </span>
                {REPLY_TEMPLATE_KINDS.map((k) => (
                  <label key={k.key} className="block">
                    <span className="flex items-baseline gap-2 text-[12px] font-medium text-warm-black">
                      {k.label}
                      <span className="text-[11px] font-normal text-gray-faint">{k.hint}</span>
                    </span>
                    <textarea
                      value={examples[k.key]}
                      onChange={(e) => setExamples((prev) => ({ ...prev, [k.key]: e.target.value }))}
                      rows={2}
                      maxLength={500}
                      className="mt-1 w-full resize-none rounded-lg border border-glass-border bg-glass px-3 py-2 text-[13px] text-warm-black placeholder:text-gray-faint focus:border-accent/50 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : saved ? <Check className="h-4 w-4" strokeWidth={2.4} /> : null}
          {saved ? "Saved" : "Save"}
        </button>
        {error && <span className="text-[12px] text-critical">{error}</span>}
      </div>
    </section>
  );
}
