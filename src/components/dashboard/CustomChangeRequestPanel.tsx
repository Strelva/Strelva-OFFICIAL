"use client";

import { useState } from "react";
import { Check, Send } from "lucide-react";
import { useDashboard } from "./DashboardContext";

export function CustomChangeRequestPanel() {
  const { selectedNode, activeSection, activePage, dashboardHref } = useDashboard();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  const section = selectedNode?.section || activeSection || undefined;
  const label = selectedNode?.label || section || activePage;

  async function submitRequest() {
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch(dashboardHref("/api/change-requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          prompt,
          page: activePage,
          section,
          field: selectedNode?.field,
          label,
          nodeType: selectedNode?.nodeType,
          rect: selectedNode?.rect,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setPrompt("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch {
      setError(true);
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
          Code, animation, custom component, and deeper layout changes go to the Scaffold Web team.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-lg border border-gray-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-gray-faint">
            Selected
          </p>
          <p className="mt-1 truncate text-[12px] font-medium text-warm-white">
            {label || "Current page"}
          </p>
          {selectedNode?.field && (
            <p className="mt-1 break-all font-mono text-[10px] text-gray-faint">
              {selectedNode.field}
            </p>
          )}
        </div>

        <label className="mt-4 block text-[11px] text-gray-muted">
          What should change?
        </label>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={7}
          placeholder="Example: Make this section feel more premium with a different layout and a softer entrance animation."
          className="mt-1 w-full resize-none rounded-xl border border-gray-border bg-surface-inset px-3 py-2 text-[13px] leading-5 text-warm-white outline-none transition-colors placeholder:text-gray-subtle focus:border-accent/45"
        />

        {error && (
          <p className="mt-2 text-[11px] text-red-400">
            Could not send the request. Try again.
          </p>
        )}
        {sent && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
            <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
            Request sent to Scaffold Web.
          </p>
        )}
      </div>

      <div className="border-t border-gray-border p-4">
        <button
          type="button"
          onClick={submitRequest}
          disabled={submitting || !prompt.trim()}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
          {submitting ? "Sending..." : "Send request"}
        </button>
      </div>
    </div>
  );
}
