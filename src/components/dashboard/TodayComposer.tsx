"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XaButton, XaComposer, type XaWaitingItem } from "@/components/ui/strelva/Xa";
import { useDashboard } from "./DashboardContext";

/**
 * The owner Home composer (XA · O1). Typing here opens Ask Strelva with the
 * words already in place; nothing is sent until the owner sends it there. When
 * something waits, it rides on top of the composer with one "Review" action.
 */
export function TodayComposer({ businessName, waiting }: { businessName: string; waiting?: { title: string; from: "strelva" | string } | null }) {
  const { dashboardHref, setChatPrompt, readOnly } = useDashboard();
  const router = useRouter();
  const [value, setValue] = useState("");
  const item: XaWaitingItem | undefined = waiting ? {
    kicker: waiting.from === "strelva" ? "Waits for you · prepared by Strelva" : `Waits for you · from ${waiting.from}`,
    title: waiting.title,
    from: waiting.from === "strelva" ? { pebble: true } : { name: waiting.from },
    action: <XaButton size="sm" onClick={() => document.getElementById("needs-you-label")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Review</XaButton>,
  } : undefined;
  return <XaComposer
    value={value}
    onChange={setValue}
    disabled={readOnly}
    onSubmit={() => { setChatPrompt(value.trim()); router.push(dashboardHref("/dashboard/chat")); }}
    placeholder="Ask Strelva for anything"
    scope={{ label: businessName, state: "live" }}
    waiting={item}
  />;
}
