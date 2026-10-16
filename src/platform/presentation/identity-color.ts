/**
 * A stable identity color for a business or client initial, so a list of
 * businesses never reads as identical dark squares. Presentation only: the
 * same id always gets the same color from the paper, ink, moss and clay family.
 */
const IDENTITY_COLORS = ["#2f5236", "#9c522c", "#4f7590", "#7b5a3c", "#55704a", "#8a6a2e"] as const;

export function identityColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return IDENTITY_COLORS[hash % IDENTITY_COLORS.length]!;
}
