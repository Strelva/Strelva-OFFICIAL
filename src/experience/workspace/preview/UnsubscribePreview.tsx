"use client";
import { useState } from "react";
import { UnsubscribeView, type UnsubscribeState } from "@/experience/publishing/UnsubscribeView";

/** Fictional resubscribe affordance only; no resubscribe API exists. */
export function UnsubscribePreview({ state }: { state: string }) {
  const [current, setCurrent] = useState<UnsubscribeState>(["loading", "permission", "error", "empty", "confirm"].includes(state) ? state as UnsubscribeState : "ready");
  return <UnsubscribeView state={current} businessName="The Mooney Firm" address="alex@…" onUndo={() => setCurrent("restored")} onConfirm={() => setCurrent("ready")} />;
}
