"use client";

import { useRouter } from "next/navigation";
import { XaTextLink } from "@/components/ui/strelva/Xa";
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
    <XaTextLink onClick={() => { setChatPrompt(prompt); router.push(dashboardHref("/dashboard/chat")); }}>{label}</XaTextLink>
  );
}
