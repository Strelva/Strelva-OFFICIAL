"use client";

import { useState, useEffect } from "react";
import { useDashboard } from "./DashboardContext";
import { Card } from "@/components/ui/Card";

interface Suggestion {
  id: string;
  type: "stale" | "missing" | "growth" | "engagement";
  title: string;
  description: string;
  action: string;
  section?: string;
}

export function SuggestionCards() {
  const { setChatPrompt } = useDashboard();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/suggestions")
      .then((r) => r.json())
      .then((data) => setSuggestions(data.suggestions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAccept(suggestion: Suggestion) {
    // Mark as accepted
    await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId: suggestion.id, status: "accepted" }),
    });

    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));

    // Trigger the chat with the suggestion's action
    if (suggestion.action.startsWith("prompt:")) {
      setChatPrompt(suggestion.action.slice(7));
    } else if (suggestion.action.startsWith("update_section:")) {
      const section = suggestion.action.split(":")[1];
      setChatPrompt(`Can you freshen up my ${section} section? It hasn't been updated in a while.`);
    }
  }

  async function handleDismiss(suggestion: Suggestion) {
    await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId: suggestion.id, status: "dismissed" }),
    });
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
  }

  if (loading || suggestions.length === 0) return null;

  return (
    <Card data-ov="suggestions" padding="none" className="bg-sage/[0.06] border-sage/[0.12] px-4 py-3 mb-5">
      <h2 className="text-[11px] font-medium tracking-wider text-sage mb-3">AI Suggestions</h2>
      <div className="space-y-2.5">
        {suggestions.slice(0, 3).map((s) => (
          <div key={s.id} className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-warm-black">{s.title}</p>
              <p className="text-[11px] text-gray-muted mt-0.5 leading-relaxed">{s.description}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              <button
                onClick={() => handleAccept(s)}
                className="text-[11px] font-medium text-white bg-sage hover:bg-sage/90 rounded-md px-2.5 py-1 transition-colors"
              >
                Yes, do it
              </button>
              <button
                onClick={() => handleDismiss(s)}
                className="text-[11px] text-gray-muted hover:text-warm-black rounded-md px-1.5 py-1 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
