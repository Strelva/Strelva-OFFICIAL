import { StCopy, StTextButton } from "@/components/ui/strelva/Kit";
import { DraftChangePreview } from "./DraftChangePreview";
import type { QueueEventLike } from "@/components/dashboard/QueueEventDetail";

/** Support inspection only. Client decisions require ordinary workspace access. */
export function DraftActions({ preview }: { tenant: string; section: string; preview?: QueueEventLike; readOnly?: boolean }) {
  return <div className="flex w-full flex-col gap-4 pt-4">
    <DraftChangePreview event={preview} />
    <StCopy muted>The business owner reviews this change. Platform support cannot approve or reject client content.</StCopy>
    <StTextButton href="/workspace">Open business workspace</StTextButton>
  </div>;
}
