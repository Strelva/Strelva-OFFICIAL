/**
 * Tiny SVG + ASCII chart helpers for the benchmark report.
 *
 * Two output styles:
 * - SVG (for the headline visual; renders on GitHub markdown viewers and in
 *   most editors via raw <svg> tags)
 * - Unicode block bars (for the per-category / per-dimension tables; render
 *   in any markdown viewer including monospaced plain text)
 *
 * The SVGs are intentionally compact and use only attributes / elements
 * GitHub's markdown sanitizer keeps intact: <svg>, <rect>, <text>, <g>.
 * No CSS, no <style>, no JS.
 */

/** Choose a status color based on a pass ratio. */
function statusColor(ratio: number): string {
  if (ratio >= 0.85) return "#16a34a"; // strong green
  if (ratio >= 0.6) return "#84cc16"; // lime
  if (ratio >= 0.4) return "#eab308"; // amber
  if (ratio >= 0.2) return "#f97316"; // orange
  return "#dc2626"; // red
}

/** A 25-char unicode block-character bar. Renders in any plaintext viewer. */
export function asciiBar(value: number, max: number, width = 25): string {
  if (max <= 0) return " ".repeat(width);
  const pct = Math.max(0, Math.min(1, value / max));
  const eighths = Math.round(pct * width * 8);
  const full = Math.floor(eighths / 8);
  const remainder = eighths - full * 8;
  const partial =
    remainder === 0
      ? ""
      : remainder === 1
        ? "▏"
        : remainder === 2
          ? "▎"
          : remainder === 3
            ? "▍"
            : remainder === 4
              ? "▌"
              : remainder === 5
                ? "▋"
                : remainder === 6
                  ? "▊"
                  : "▉";
  const empty = Math.max(0, width - full - (partial ? 1 : 0));
  return "█".repeat(full) + partial + "░".repeat(empty);
}

export interface BarRow {
  label: string;
  value: number;
  total: number;
}

/**
 * Render a list of bars as an ASCII-art table inside a markdown code block.
 * Use this for per-category / per-dimension / per-difficulty breakdowns
 * because they render perfectly in any markdown viewer.
 */
export function asciiBarTable(rows: BarRow[]): string {
  if (rows.length === 0) return "```\n(no rows)\n```";
  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  const lines = rows.map((row) => {
    const pct = row.total > 0 ? Math.round((row.value / row.total) * 100) : 0;
    const bar = asciiBar(row.value, row.total);
    const fraction = `${row.value}/${row.total}`.padStart(7);
    return `${row.label.padEnd(labelWidth)}  ${fraction}  ${bar}  ${pct.toString().padStart(3)}%`;
  });
  return "```\n" + lines.join("\n") + "\n```";
}

/**
 * The headline SVG — large Resolved% number plus a progress bar. Renders
 * inline at the top of the report.
 */
export function headlineSvg(resolved: number, total: number): string {
  const pct = total > 0 ? resolved / total : 0;
  const pctText = `${Math.round(pct * 100)}%`;
  const color = statusColor(pct);
  const barWidth = 560;
  const filled = Math.round(barWidth * pct);
  return [
    `<svg viewBox="0 0 600 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Resolved ${resolved} of ${total} (${pctText})">`,
    `  <text x="20" y="55" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="48" font-weight="700" fill="${color}">${pctText}</text>`,
    `  <text x="${20 + pctText.length * 28}" y="40" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="600" fill="#1f2937">Resolved</text>`,
    `  <text x="${20 + pctText.length * 28}" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="13" fill="#6b7280">${resolved} / ${total} cases</text>`,
    `  <rect x="20" y="78" width="${barWidth}" height="14" rx="7" fill="#e5e7eb"/>`,
    `  <rect x="20" y="78" width="${filled}" height="14" rx="7" fill="${color}"/>`,
    `</svg>`,
  ].join("\n");
}

/**
 * Horizontal bar chart as a self-contained SVG. Useful for the difficulty
 * breakdown — one chart, three bars, no monospace needed.
 */
export function horizontalBarChartSvg(
  title: string,
  rows: BarRow[],
  options: { width?: number; rowHeight?: number; labelWidth?: number } = {},
): string {
  const width = options.width ?? 600;
  const rowHeight = options.rowHeight ?? 32;
  const labelWidth = options.labelWidth ?? 100;
  const valueWidth = 80;
  const padX = 12;
  const titleHeight = title ? 28 : 0;
  const barAreaWidth = width - labelWidth - valueWidth - padX * 2;
  const height = titleHeight + rows.length * rowHeight + 12;

  const parts: string[] = [];
  parts.push(
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title || "Chart"}">`,
  );
  if (title) {
    parts.push(
      `  <text x="${padX}" y="20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="600" fill="#1f2937">${title}</text>`,
    );
  }
  rows.forEach((row, i) => {
    const y = titleHeight + i * rowHeight;
    const pct = row.total > 0 ? row.value / row.total : 0;
    const filled = Math.round(barAreaWidth * pct);
    const color = statusColor(pct);
    const pctText = `${row.value}/${row.total}  ${Math.round(pct * 100)}%`;
    parts.push(
      `  <text x="${padX}" y="${y + 19}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="13" fill="#374151">${row.label}</text>`,
      `  <rect x="${padX + labelWidth}" y="${y + 9}" width="${barAreaWidth}" height="14" rx="3" fill="#f3f4f6"/>`,
      `  <rect x="${padX + labelWidth}" y="${y + 9}" width="${filled}" height="14" rx="3" fill="${color}"/>`,
      `  <text x="${padX + labelWidth + barAreaWidth + 6}" y="${y + 19}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12" fill="#6b7280">${pctText}</text>`,
    );
  });
  parts.push(`</svg>`);
  return parts.join("\n");
}
