/** The client initial colours from AG1–AG6: moss, clay ink, slate, stone, and two quiet neighbours. */
const CLIENT_COLORS = ["#2f5236", "#9c522c", "#4f7590", "#6b6f68", "#5f6b3a", "#7a5a6e"] as const;

/** A stable colour per client, so the same business keeps its colour on every screen. */
export function clientColor(workspaceId: string): string {
  let hash = 0;
  for (let index = 0; index < workspaceId.length; index++) hash = (hash * 31 + workspaceId.charCodeAt(index)) >>> 0;
  return CLIENT_COLORS[hash % CLIENT_COLORS.length]!;
}
