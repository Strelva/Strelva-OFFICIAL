export function timeAgo(input: string | number): string {
  const ts = typeof input === "string" ? new Date(input).getTime() : input;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/** Compute field-level diffs between two section objects (for activity logging) */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { field: string; before: string; after: string }[] {
  const changes: { field: string; before: string; after: string }[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    // Skip internal/meta fields
    if (key.startsWith("_") || key === "sectionLabel") continue;

    const bStr = JSON.stringify(before[key] ?? "");
    const aStr = JSON.stringify(after[key] ?? "");
    if (bStr !== aStr) {
      const summarize = (val: unknown): string => {
        if (typeof val === "string") return val.slice(0, 100);
        if (Array.isArray(val)) return `${val.length} items`;
        return String(val).slice(0, 100);
      };
      changes.push({
        field: key,
        before: summarize(before[key]),
        after: summarize(after[key]),
      });
    }
  }
  return changes;
}
