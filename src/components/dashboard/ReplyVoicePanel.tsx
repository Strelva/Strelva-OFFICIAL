"use client";

import { useState } from "react";
import { XaButton, XaChoices, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import {
  REPLY_TEMPLATE_KINDS,
  type ReplyMode,
  type ReplyVoice,
  type ReplyTemplateKey,
} from "@/lib/reviews/reply-voice";

const MODES: { value: ReplyMode; label: string; blurb: string }[] = [
  { value: "auto", label: "Post them for me", blurb: "Replies post on their own after a short wait. You do nothing." },
  { value: "approve", label: "Write them, I say yes", blurb: "Each reply is written for you and waits for your yes before it posts." },
  { value: "off", label: "Leave my reviews alone", blurb: "Strelva doesn't write or post replies." },
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

  const hasVoice = Boolean(guidance || Object.values(examples).some(Boolean));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="reply-voice-label">
      <XaChoices
        label={<span id="reply-voice-label">How Strelva answers your reviews</span>}
        value={mode}
        onChange={setMode}
        options={MODES.map((m) => ({ value: m.value, label: m.label, detail: m.blurb }))}
      />

      {mode !== "off" && (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[14px]">
            <XaTextLink onClick={() => setOpen((v) => !v)} aria-label={open ? "Hide your voice" : "Tune your voice"}>{open ? "Hide your voice" : hasVoice ? "Change your voice" : "Tune your voice"}</XaTextLink>
          </p>
          {open && (
            <div className="flex max-w-[620px] flex-col gap-4">
              <XaTextArea
                label="How you sound"
                hint="One line on your tone, like: warm, straight-talking, first names, never corporate."
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                rows={2}
                maxLength={600}
                placeholder="Friendly and down to earth. First names, no jargon, quick to thank people by name."
              />
              {REPLY_TEMPLATE_KINDS.map((k) => (
                <XaTextArea
                  key={k.key}
                  label={`Example reply: ${k.label.toLowerCase()}`}
                  hint={k.hint}
                  value={examples[k.key]}
                  onChange={(e) => setExamples((prev) => ({ ...prev, [k.key]: e.target.value }))}
                  rows={2}
                  maxLength={500}
                />
              ))}
              <p className="m-0 text-[13px] text-[var(--st-text-3)]">Strelva mirrors the tone of your examples and never copies the words.</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <XaButton busy={saving} onClick={save}>{saved ? "Saved" : "Save how Strelva answers"}</XaButton>
        {error ? <span className="text-[14px] text-[var(--st-critical)]" role="alert">{error}</span> : null}
      </div>
    </section>
  );
}
