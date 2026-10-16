"use client";

import type { UnifiedEvent } from "@/lib/types";
import { XaEmpty, XaRow, XaRows, XaStatus } from "@/components/ui/strelva/Xa";
import { queueLead, formatEventStatus } from "./QueueCard";

/** Needs you with nothing waiting: Pebble keeps watching, and what was just handled stays in view. */
export function EmptyQueue({ staleSectionCount = 0, recent = [], compact = false }: { staleSectionCount?: number; recent?: readonly UnifiedEvent[]; compact?: boolean }) {
  const job = staleSectionCount > 0
    ? `Watching ${staleSectionCount} older part${staleSectionCount === 1 ? "" : "s"} of your site for a refresh`
    : "Watching your site for anything that needs your yes";
  return (
    <div className="flex flex-col gap-6">
      <XaEmpty pose="resting" size={compact ? "sm" : "md"} job={job} title="Nothing needs you right now.">
        Larger changes wait here for your yes before they go live. Small, safe edits go live from the site editor.
      </XaEmpty>
      {recent.length > 0 ? (
        <XaRows label="Recently handled">
          {recent.map((event) => <XaRow key={event.id} lead={queueLead(event, 32)} title={event.title} meta={<XaStatus kind={event.status === "dismissed" ? "draft" : "live"} size="sm">{formatEventStatus(event)}</XaStatus>} />)}
        </XaRows>
      ) : null}
    </div>
  );
}
