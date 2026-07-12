/**
 * The one pill style shared by every dashboard segmented control — the Website
 * section tabs, the Reports Weekly/Monthly toggle, and the Analytics range switch —
 * so they read as a single system instead of three different-looking strips. Was
 * duplicated verbatim in ReportsViewToggle + AnalyticsRangeSelector; the Website
 * sub-nav had its own square gray-active variant, which is why it looked off.
 */
export function segmentPill(active: boolean): string {
  return [
    "inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
    active
      ? "bg-accent text-on-accent"
      : "border border-glass-border bg-glass text-gray-fg hover:text-warm-black",
  ].join(" ");
}
