/** A same-tab draft handoff. This carries text only, never permission or a send. */
const PREFIX = "strelva:website-request:";
export function prepareWebsiteRequestDraft(site: { id: string; href: string }, request: string, storage: Pick<Storage, "setItem">, origin: string, token: string, now = Date.now()): string {
  const target = new URL(site.href, origin);
  if (target.origin !== origin && target.origin !== "https://app.strelva.com") throw new Error("Open this website from Strelva to continue.");
  if (!/^\/((client\/[a-z0-9_-]+\/)?dashboard)(\/)?$/.test(target.pathname)) throw new Error("This website has no request destination.");
  if (!request.trim() || request.length > 12000 || !/^[a-zA-Z0-9-]{8,80}$/.test(token)) throw new Error("Check the website request before continuing.");
  storage.setItem(`${PREFIX}${token}`, JSON.stringify({ siteId: site.id, request, createdAt: now }));
  return `${target.pathname.replace(/\/$/, "")}/chat?draft=${encodeURIComponent(token)}`;
}
export function consumeWebsiteRequestDraft(token: string, siteId: string, storage: Pick<Storage, "getItem" | "removeItem">, now = Date.now()): string | null {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(token)) return null;
  const key = `${PREFIX}${token}`, raw = storage.getItem(key);
  if (!raw) return null;
  let value: { siteId?: unknown; request?: unknown; createdAt?: unknown };
  try { value = JSON.parse(raw); } catch { storage.removeItem(key); return null; }
  if (value.siteId !== siteId) return null;
  storage.removeItem(key);
  if (typeof value.createdAt !== "number" || now - value.createdAt > 15 * 60000 || now < value.createdAt || typeof value.request !== "string" || value.request.length > 12000) return null;
  return value.request;
}
