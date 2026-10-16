/** Mail clients need literal values. Mirrors the workspace XA light roles
 * (workspace-xa.css: --st-action for the one ink primary, --st-accent moss for
 * live and confirmation). Keep this serialization boundary in sync. Every
 * email is set in DM Sans alone. */
export const PAPER_EMAIL = {
  canvas: "#f4f4f1", surface: "#ffffff", inset: "#efefeb", line: "#e4e4df",
  text: "#161715", muted: "#5f615c", faint: "#6b6d67", accent: "#2f5236",
  /** The one primary button in an email is ink, like the product's one ink pill. */
  action: "#161715", onAction: "#ffffff",
  onAccent: "#ffffff", need: "#9c522c", live: "#3e8e5a",
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
} as const;
