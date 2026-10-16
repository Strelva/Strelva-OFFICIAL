/** Mail clients need literal values. Mirrors workspace-paper.css's light roles.
 * Keep this serialization boundary in sync with the paper foundation. The
 * paper head links DM Sans; clients that block web fonts read the web-safe
 * fallbacks. The primary action is the ink pill (`text`), never moss. */
export const PAPER_EMAIL = {
  canvas: "#f4f4f1", surface: "#ffffff", inset: "#efefeb", line: "#e4e4df",
  text: "#161715", muted: "#5f615c", faint: "#6b6d67", accent: "#2f5236",
  onAccent: "#ffffff", need: "#9c522c", live: "#3e8e5a",
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;
