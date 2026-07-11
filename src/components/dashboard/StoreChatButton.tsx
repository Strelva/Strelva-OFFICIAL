"use client";

import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { useDashboardOptional } from "./DashboardContext";

/**
 * Routes a store action into the governed agent chat — prefills "Ask Strelva"
 * with a ready-made ask and jumps to the chat. It never sends anything itself
 * (no external send path); the agent is the one governed surface that acts.
 */
export function StoreChatButton({ prompt, label }: { prompt: string; label: string }) {
  const router = useRouter();
  const dashboard = useDashboardOptional();
  const setChatPrompt = dashboard?.setChatPrompt;
  const dashboardHref = dashboard?.dashboardHref ?? ((p: string) => p);

  // Outside the dashboard shell there's no chat to open — hide rather than dead-click.
  if (!setChatPrompt) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setChatPrompt(prompt);
        router.push(dashboardHref("/dashboard/chat"));
      }}
      className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-glass-border bg-glass px-2.5 text-[12px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
    >
      <MessageSquarePlus className="h-3.5 w-3.5 text-accent" strokeWidth={1.6} />
      {label}
    </button>
  );
}
