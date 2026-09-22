export interface WorkspaceSearchItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  onOpen?: () => void;
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}

/** No preview cap: all matching authorized items remain reachable. */
export function searchWorkspaceItems(items: readonly WorkspaceSearchItem[], query: string): WorkspaceSearchItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const text = normalize(`${item.title} ${item.detail}`);
    return words.every(word => text.includes(word));
  });
}
