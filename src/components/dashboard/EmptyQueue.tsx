"use client";

import type { UnifiedEvent } from "@/lib/types";
import { XaEmpty, XaLabel, XaRow, XaRows, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { queueLead, formatEventStatus } from "./QueueCard";

/**
 * Needs you with nothing waiting: Pebble keeps watching. What was just handled
 * stays in view under its own label, "Done lately", with the way to the Done
 * list, so the Open filter never seems to show done things as open.
 */
export function EmptyQueue({ staleSectionCount = 0, recent = [], compact = false, onShowDone, doneHref }: { staleSectionCount?: number; recent?: readonly UnifiedEvent[]; compact?: boolean; onShowDone?: () => void; doneHref?: string }) {
  const job = staleSectionCount > 0
    ? `Watching ${staleSectionCount} older part${staleSectionCount === 1 ? "" : "s"} of your site for a refresh`
    : "Watching your site for anything that needs your yes";
  return (
    <div className="flex flex-col gap-6">
      <XaEmpty pose="resting" size={compact ? "sm" : "md"} job={job} title="Nothing needs you right now.">
        Larger changes wait here for your yes before they go live. Small, safe edits go live from your Website page.
      </XaEmpty>
      {recent.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="done-lately-label">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <XaLabel id="done-lately-label">Done lately</XaLabel>
          {onShowDone ? <XaTextLink onClick={onShowDone}>See everything done</XaTextLink> : doneHref ? <XaTextLink href={doneHref}>See everything done</XaTextLink> : null}
        </div>
        <XaRows label="Done lately">
          {recent.map((event) => <XaRow key={event.id} lead={queueLead(event, 32)} title={event.title} meta={<XaStatus kind={event.status === "dismissed" ? "draft" : "live"} size="sm">{formatEventStatus(event)}</XaStatus>} />)}
        </XaRows>
        </section>
      ) : null}
    </div>
  );
}
