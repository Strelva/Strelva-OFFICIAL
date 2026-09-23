
const PREFIX = "strelva:request-draft:v1:";
const MAX_REQUEST_LENGTH = 3_000;

export interface RequestDraftScope {
  actorEmail: string;
  workspaceId: string;
}

export function requestDraftKey(scope: RequestDraftScope): string {
  return `${PREFIX}${encodeURIComponent(scope.actorEmail.trim().toLowerCase())}:${encodeURIComponent(scope.workspaceId)}`;
}

export function readRequestDraft(storage: Pick<Storage, "getItem">, key: string): string {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 20_000) return "";
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("text" in value) || typeof value.text !== "string") return "";
    return value.text.slice(0, MAX_REQUEST_LENGTH);
  } catch {
    return "";
  }
}

export function writeRequestDraft(storage: Pick<Storage, "setItem" | "removeItem">, key: string, text: string): boolean {
  try {
    if (text) storage.setItem(key, JSON.stringify({ version: 1, text: text.slice(0, MAX_REQUEST_LENGTH) }));
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearRequestDrafts(storage: Storage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) if (key?.startsWith(PREFIX)) storage.removeItem(key);
  } catch { /* A blocked browser store does not prevent sign-out. */ }
}
