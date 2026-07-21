"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, LayoutTemplate, Palette, Send, Wrench } from "lucide-react";
import { useDashboard } from "./DashboardContext";

type RequestKind = "custom_design" | "template" | "infrastructure";

const REQUEST_KIND_OPTIONS: Array<{
  value: RequestKind;
  label: string;
  icon: typeof Palette;
}> = [
  { value: "custom_design", label: "Design", icon: Palette },
  { value: "template", label: "Template", icon: LayoutTemplate },
  { value: "infrastructure", label: "Feature", icon: Wrench },
];

export function CustomChangeRequestPanel() {
  const { selectedNode, activeSection, activePage, dashboardHref, readOnly } = useDashboard();
  const [prompt, setPrompt] = useState("");
  const [requestKind, setRequestKind] = useState<RequestKind>("custom_design");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const section = selectedNode?.section || activeSection || undefined;
  const label = selectedNode?.label || section || activePage;

  async function submitRequest() {
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(false);
    setErrorMessage(null);
    try {
      const res = await fetch(dashboardHref("/api/change-requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          prompt,
          requestKind,
          page: activePage,
          section,
          field: selectedNode?.field,
          label,
          nodeType: selectedNode?.nodeType,
          rect: selectedNode?.rect,
        }),
      });
      if (!res.ok) {
        // The one-active-request wall returns 409 with a friendly message that
        // names what's already in flight — surface that instead of the generic
        // "try again" so the owner knows why this didn't go through.
        if (res.status === 409) {
          const body = await res.json().catch(() => null);
          const title =
            body && typeof body.activeRequest?.title === "string"
              ? body.activeRequest.title
              : null;
          const message =
            body && typeof body.message === "string"
              ? body.message
              : "You already have a custom request in progress.";
          setErrorMessage(title ? `${message} (in progress: "${title}")` : message);
          setError(true);
          setTimeout(() => setError(false), 8000);
          return;
        }
        throw new Error("Request failed");
      }
      setPrompt("");
      setSent(true);
    } catch {
      setError(true);
      setErrorMessage(null);
      setTimeout(() => setError(false), 4000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-gray-border px-4 py-3">
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-gray-muted">
          Custom request
        </p>
        <p className="mt-1 text-[12px] leading-5 text-gray-faint">
          Code, animation, custom component, and deeper layout changes go to the Strelva team.
        </p>
        <p className="mt-2 text-[12px] leading-5 text-gray-muted">
          Design, template, and feature changes are quoted separately from your monthly plan.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-lg border border-gray-border bg-surface-raised px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">
            Selected
          </p>
          <p className="mt-1 truncate text-[12px] font-medium text-warm-white">
            {label || "Current page"}
          </p>
          {selectedNode?.field && (
            <p className="mt-1 break-all font-mono text-[11px] text-gray-faint">
              {selectedNode.field}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1">
          {REQUEST_KIND_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = requestKind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setRequestKind(option.value)}
                aria-pressed={active}
                className={`flex h-8 items-center justify-center gap-1 rounded-md border text-[11px] font-medium transition-colors ${
                  active
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-gray-border text-gray-muted hover:text-warm-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                {option.label}
              </button>
            );
          })}
        </div>

        <label className="mt-4 block text-[11px] text-gray-muted">
          What should change?
        </label>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={7}
          placeholder="Example: Update this section's text to mention our new Saturday hours."
          className="mt-1 w-full resize-none rounded-xl border border-gray-border bg-surface-inset px-3 py-2 text-[13px] leading-5 text-warm-white outline-none transition-colors placeholder:text-gray-subtle focus:border-accent/45"
        />

        {error && (
          <p className="mt-2 text-[11px] text-critical">
            {errorMessage ?? "Could not send the request. Try again."}
          </p>
        )}
        {sent && (
          <div className="mt-3 rounded-lg border border-positive/25 bg-positive/10 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-positive">
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Request received
            </p>
            <p className="mt-1 text-[11px] leading-[1.55] text-gray-muted">
              We&apos;ll review this and get back to you with a quote. You can track it under your approvals in the meantime.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-2 text-[11px] text-accent hover:underline"
            >
              Send another request
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-gray-border p-4">
        {readOnly ? (
          <p className="text-center text-[12px] leading-relaxed text-gray-muted">
            This is a read-only demo.{" "}
            <Link href="/access-request" className="font-medium text-accent hover:underline">
              Get your own site to send requests
            </Link>
          </p>
        ) : (
          !sent && (
            <button
              type="button"
              onClick={submitRequest}
              disabled={submitting || !prompt.trim()}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
              {submitting ? "Sending..." : "Send request"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
