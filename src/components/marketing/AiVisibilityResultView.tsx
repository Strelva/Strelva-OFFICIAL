"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, Share2, XCircle } from "lucide-react";
import type { AiVisibilityResult, Grade } from "@/lib/ai-visibility/score";

interface AiVisibilityResultViewProps {
  result: AiVisibilityResult;
  scanId: string | null;
  shareUrl: string | null;
  onReset: () => void;
}

type MonitorState = "idle" | "saving" | "saved" | "error";

function gradeColor(grade: Grade): string {
  switch (grade) {
    case "A": return "var(--m-success)";
    case "B": return "var(--m-accent)";
    case "C": return "#e9a23b";
    case "D": return "#e97a3b";
    default: return "var(--m-danger)";
  }
}

export function AiVisibilityResultView({ result, scanId, shareUrl, onReset }: AiVisibilityResultViewProps) {
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const [email, setEmail] = useState("");
  const [monitorState, setMonitorState] = useState<MonitorState>("idle");
  const [monitorError, setMonitorError] = useState("");

  async function handleShare() {
    const url = shareUrl || window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${result.business} AI Visibility scorecard`, text: `${result.grade} · ${result.score}/100`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareStatus("copied");
      } catch {
        setShareStatus("idle");
      }
    }
  }

  async function handleMonitor(event: FormEvent) {
    event.preventDefault();
    if (!scanId) return;
    setMonitorState("saving");
    setMonitorError("");
    try {
      const response = await fetch(`/api/ai-visibility/${scanId}/monitor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "We couldn't save your request.");
      }
      setMonitorState("saved");
    } catch (cause) {
      setMonitorError(cause instanceof Error ? cause.message : "We couldn't save your request.");
      setMonitorState("error");
    }
  }

  return (
    <div className="motion-rise">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-28 items-center justify-center rounded-full border-4 sm:size-32" style={{ borderColor: gradeColor(result.grade), background: `color-mix(in oklch, ${gradeColor(result.grade)} 10%, transparent)` }}>
          <div>
            <div className="text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: gradeColor(result.grade) }}>{result.grade}</div>
            <div className="text-[13px] font-semibold tabular-nums" style={{ color: gradeColor(result.grade) }}>{result.score}/100</div>
          </div>
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-m-text sm:text-3xl">{result.business}</h2>
        {result.url && <p className="mt-2 text-[14px] text-m-text-3">{result.url}</p>}
        <p className="mx-auto mt-4 max-w-[560px] text-[16px] font-medium leading-[1.6] text-m-text">{result.verdict}</p>
        {scanId && (
          <button type="button" onClick={handleShare} className="marketing-button-secondary mt-5 h-11 px-5 text-[13px]">
            {shareStatus === "copied" ? <Check className="size-4" /> : <Share2 className="size-4" />}
            {shareStatus === "copied" ? "Link copied" : "Share scorecard"}
          </button>
        )}
      </div>

      {result.signals.length > 0 && (
        <div className="mt-10">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-m-text-3">AI readiness signals</h3>
          <ul className="mt-4 grid gap-3">
            {result.signals.map((signal) => (
              <li key={signal.id} className="flex gap-3 rounded-2xl border border-m-rule-soft bg-m-panel p-4">
                {signal.pass ? <CheckCircle2 className="size-5 shrink-0 text-m-success" /> : <XCircle className="size-5 shrink-0 text-m-danger" />}
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-m-text">{signal.label}<span className="ml-2 text-[12px] font-normal text-m-text-3">{signal.weight} pts</span></p>
                  <p className="text-[13px] text-m-text-2">{signal.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-m-rule-soft bg-m-panel p-5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-m-text-3">Live AI citation probe</h3>
        <p className="mt-2 text-[14px] leading-[1.6] text-m-text-2">{result.citation.note}</p>
      </div>
      <div className="mt-6 rounded-2xl border-l-4 bg-m-panel p-5" style={{ borderLeftColor: gradeColor(result.grade) }}>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-m-text-3">Do this first</h3>
        <p className="mt-2 text-[15px] font-medium leading-[1.6] text-m-text">{result.topFix}</p>
      </div>

      {scanId && (
        <div className="mt-8 rounded-2xl border border-m-rule-soft bg-m-panel p-6">
          <h3 className="text-lg font-semibold text-m-text">Join the monitoring pilot</h3>
          <p className="mt-2 text-[14px] leading-[1.6] text-m-text-2">We’re testing recurring AI Visibility checks. Leave your email and we’ll contact you when a monitoring spot opens.</p>
          {monitorState === "saved" ? (
            <p className="mt-4 flex items-center gap-2 text-[14px] font-medium text-m-success"><CheckCircle2 className="size-5" />You’re on the pilot list.</p>
          ) : (
            <form onSubmit={handleMonitor} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" autoComplete="email" className="h-12 min-w-0 flex-1 rounded-xl border border-m-rule bg-m-surface px-4 text-[15px] text-m-text outline-none placeholder:text-m-text-3 focus:border-m-accent" />
              <button type="submit" disabled={monitorState === "saving"} className="marketing-button-secondary h-12 px-5 disabled:opacity-60">{monitorState === "saving" ? "Saving…" : "Join pilot"}</button>
            </form>
          )}
          {monitorError && <p role="alert" className="mt-3 text-[13px] text-m-danger">{monitorError}</p>}
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-m-accent bg-m-accent-faint p-6 text-center sm:p-8">
        <h3 className="text-xl font-semibold text-m-text sm:text-2xl">Want to be the answer AI gives?</h3>
        <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.6] text-m-text-2">Strelva builds and manages local business websites so their facts are easier for people and AI systems to find, understand, and trust.</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={`/access-request?ref=ai-visibility${scanId ? `&scan=${encodeURIComponent(scanId)}` : ""}`} className="marketing-button-primary h-12 px-6">Get this fixed <ArrowRight className="size-4" /></Link>
          <button type="button" onClick={onReset} className="marketing-button-secondary h-12 px-6">Audit another business</button>
        </div>
      </div>
    </div>
  );
}
