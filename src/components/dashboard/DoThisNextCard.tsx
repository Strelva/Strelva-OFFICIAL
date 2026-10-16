"use client";

import { useRouter } from "next/navigation";
import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { useDashboard } from "./DashboardContext";

/**
 * Strelva's one idea for this week, said as a sentence with one action. The
 * action prefills Ask Strelva with the exact ask (setChatPrompt + navigate),
 * so the owner never retypes it. Rendered only for a real pending suggestion.
 */
export function DoThisNextCard({ title, prompt }: { title: string; prompt: string }) {
  const { dashboardHref, setChatPrompt } = useDashboard();
  const router = useRouter();

  function ask() {
    setChatPrompt(prompt);
    router.push(dashboardHref("/dashboard/chat"));
  }

  return <XaSays links={[<XaTextLink key="ask" onClick={ask}>Ask Strelva to do it</XaTextLink>]}>One idea for this week: {title.replace(/\.$/, "")}.</XaSays>;
}
