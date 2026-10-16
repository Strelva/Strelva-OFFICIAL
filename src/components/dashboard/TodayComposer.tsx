"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XaComposer } from "@/components/ui/strelva/Xa";
import { useDashboard } from "./DashboardContext";
import { dashboardAskPlaceholder } from "./xa/DashboardXa";

/**
 * The owner Home composer (XA · O1). Typing here opens Ask Strelva with the
 * words already in place; nothing is sent until the owner sends it there.
 * What waits is never repeated here: it is open above, in Needs you.
 */
export function TodayComposer({ businessName }: { businessName: string }) {
  const { dashboardHref, setChatPrompt, readOnly } = useDashboard();
  const router = useRouter();
  const [value, setValue] = useState("");
  return <XaComposer
    value={value}
    onChange={setValue}
    disabled={readOnly}
    onSubmit={() => { setChatPrompt(value.trim()); router.push(dashboardHref("/dashboard/chat")); }}
    placeholder={dashboardAskPlaceholder()}
    inputLabel={`Ask Strelva about ${businessName}`}
  />;
}
