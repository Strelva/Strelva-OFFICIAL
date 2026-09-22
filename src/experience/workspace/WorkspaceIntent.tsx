"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface RequestIntent { request: string; route: string; ready: boolean }
const IntentContext = createContext<RequestIntent>({ request: "", route: "", ready: true });
export function useWorkspaceIntent() { return useContext(IntentContext); }

type Props = { request: string; current?: boolean; route?: string; draftKey: string; children: ReactNode };
const ROUTES = new Set(["start", "plan", "help", "assessment", "document", "tracker", "inquiries", "website", "websites", "applications", "onboarding", "scheduling", "investigations", "operations"]);

/** Request data only. Never authorization to execute, share, or publish work. */
export function retainRequestIntent(storage: Pick<Storage, "setItem">, draftKey: string, request: string, route: string): void {
  if (!ROUTES.has(route)) return;
  try { storage.setItem(`${draftKey}:continuation`, JSON.stringify({ version: 1, request: request.slice(0, 3000), route })); }
  catch { /* The current in-memory request remains available. */ }
}

export function WorkspaceIntent(props: Props) { return <IntentSession key={props.draftKey} {...props} />; }
function IntentSession({ request, current = false, route = "start", draftKey, children }: Props) {
  const [retained, setRetained] = useState<RequestIntent>({ request: "", route: "", ready: false });
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let restored: RequestIntent = { request: "", route: "", ready: true };
      try {
        const raw = window.sessionStorage.getItem(`${draftKey}:continuation`);
        const value: unknown = raw && raw.length < 20000 ? JSON.parse(raw) : null;
        if (value && typeof value === "object" && "version" in value && value.version === 1 && "request" in value && typeof value.request === "string" && "route" in value && typeof value.route === "string" && ROUTES.has(value.route)) {
          restored = { request: value.request.slice(0, 3000), route: value.route, ready: true };
        }
      } catch { /* Browser storage is optional. */ }
      setRetained(restored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftKey]);
  return <IntentContext.Provider value={current || request ? { request, route, ready: true } : retained}>{children}</IntentContext.Provider>;
}
