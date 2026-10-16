/**
 * The one segmented look for dashboard link tabs (Website sections, Reports
 * Weekly/Monthly, Analytics range), drawn like XaSegmented (LX qIVLf): a quiet
 * inset track with a white thumb on the current choice. Put `segmentTrack` on
 * the container. Links keep navigation; XaSegmented is for in-page state.
 */
export const segmentTrack = "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-[var(--st-inset)] p-1 [scrollbar-width:none]";

export function segmentPill(active: boolean): string {
  return [
    "inline-flex min-h-[32px] shrink-0 items-center rounded-full px-3.5 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-(--motion-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-accent)]",
    active
      ? "bg-[var(--st-surface)] text-[var(--st-text)] shadow-[var(--st-shadow-sm)]"
      : "text-[var(--st-text-2)] hover:text-[var(--st-text)]",
  ].join(" ");
}
