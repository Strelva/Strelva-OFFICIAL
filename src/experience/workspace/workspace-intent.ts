import type { WorkspaceClientIntent } from "@/platform/workspaces/client-intent";

export interface IntentStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const MAX_AGE = 24 * 60 * 60 * 1000;
const ROUTES = new Set(["assessment", "tracker", "document", "inquiries", "website", "websites", "onboarding", "applications", "scheduling", "investigations", "operations", "plan", "help", "start"]);
function key(actor: string, workspaceId: string) { return `strelva:request:v1:${encodeURIComponent(actor.toLowerCase())}:${encodeURIComponent(workspaceId)}`; }

/** Best-effort browser draft retention. A failed storage write never pretends the server saved work. */
export function retainWorkspaceIntent(storage: IntentStorage | null, actor: string, intent: WorkspaceClientIntent, now = Date.now()): boolean {
  if (!storage || !actor || !intent.workspaceId || intent.request.length > 3000 || !ROUTES.has(intent.route)) return false;
  try { storage.setItem(key(actor, intent.workspaceId), JSON.stringify({ version: 1, ...intent, savedAt: now })); return true; } catch { return false; }
}
export function restoreWorkspaceIntent(storage: IntentStorage | null, actor: string, workspaceId: string, now = Date.now()): WorkspaceClientIntent | null {
  if (!storage || !actor || !workspaceId) return null;
  try {
    const raw = storage.getItem(key(actor, workspaceId));
    if (!raw || raw.length > 16000) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (entry.version !== 1 || entry.workspaceId !== workspaceId || typeof entry.request !== "string" || entry.request.length > 3000 || typeof entry.route !== "string" || !ROUTES.has(entry.route) || typeof entry.savedAt !== "number" || !Number.isFinite(entry.savedAt) || now - entry.savedAt > MAX_AGE || entry.savedAt > now + 60000 || (entry.templateId !== undefined && (typeof entry.templateId !== "string" || !/^[a-z0-9-]{1,80}$/.test(entry.templateId)))) return null;
    return { workspaceId, request: entry.request, route: entry.route, ...(typeof entry.templateId === "string" ? { templateId: entry.templateId } : {}) };
  } catch { return null; }
}
export function clearWorkspaceIntent(storage: IntentStorage | null, actor: string, workspaceId: string): void {
  try { storage?.removeItem(key(actor, workspaceId)); } catch { /* Browser storage is not the saved-work authority. */ }
}
export function browserIntentStorage(): IntentStorage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
