/**
 * A client's own color for its initial (XA · AG6): Harbor green, North Coast
 * rust, Lakeview blue, Fieldwork gray. The same client gets the same color on
 * every agency screen because it is derived from its workspace id, until a
 * stored client color exists. Presentation only.
 */
export const CLIENT_COLOR_PALETTE = [
  "#2f5236",
  "#9c522c",
  "#4f7590",
  "#6b6f68",
  "#7a5c8c",
  "#8a6d2f",
] as const;

export function clientColor(workspaceId: string): string {
  let hash = 0;
  for (let index = 0; index < workspaceId.length; index += 1)
    hash = (hash * 31 + workspaceId.charCodeAt(index)) >>> 0;
  return CLIENT_COLOR_PALETTE[hash % CLIENT_COLOR_PALETTE.length]!;
}
