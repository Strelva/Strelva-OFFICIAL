"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readRequestDraft } from "./request-draft";

interface RetainedIntent { request: string; route: string; ready: boolean }
interface RequestIntent extends RetainedIntent {
  /** Call once a product saved work from the routed request; it never pre-fills again. */
  spend: (consumer: string) => void;
}
const IntentContext = createContext<RequestIntent>({ request: "", route: "", ready: true, spend: () => undefined });
export function useWorkspaceIntent() { return useContext(IntentContext); }

type Props = { request: string; current?: boolean; route?: string; draftKey: string; onSpent?: (consumer: string) => void; children: ReactNode };
const ROUTES = new Set(["start", "plan", "help", "assessment", "document", "tracker", "inquiries", "website", "websites", "applications", "onboarding", "scheduling", "investigations", "operations"]);

/**
 * The product view that opens new work from a route. Choosing Applications
 * with a request opens a work plan, so the plan reads that route too.
 */
const ROUTE_CONSUMER: Readonly<Record<string, string>> = { applications: "plan" };
export function routeConsumer(route: string): string { return ROUTE_CONSUMER[route] ?? route; }

/** The routed request a product view should open with, if it was aimed there. */
export function intentRequestFor(intent: { request: string; route: string }, consumer: string): string | undefined {
  return intent.request && routeConsumer(intent.route) === consumer ? intent.request : undefined;
}

/** Request data only. Never authorization to execute, share, or publish work. */
export function retainRequestIntent(storage: Pick<Storage, "setItem">, draftKey: string, request: string, route: string): void {
  if (!ROUTES.has(route)) return;
  try { storage.setItem(`${draftKey}:continuation`, JSON.stringify({ version: 1, request: request.slice(0, 3000), route })); }
  catch { /* The current in-memory request remains available. */ }
}

function readRetainedIntent(storage: Pick<Storage, "getItem">, draftKey: string): RetainedIntent | null {
  const raw = storage.getItem(`${draftKey}:continuation`);
  const value: unknown = raw && raw.length < 20000 ? JSON.parse(raw) : null;
  if (value && typeof value === "object" && "version" in value && value.version === 1 && "request" in value && typeof value.request === "string" && "route" in value && typeof value.route === "string" && ROUTES.has(value.route)) {
    return { request: value.request.slice(0, 3000), route: value.route, ready: true };
  }
  return null;
}

/**
 * A routed request is spent once its product saved work from it: the Work now
 * carries the words. Remove the routed record, and the draft too when it still
 * holds the same words (an edited draft is newer and stays).
 */
export function spendRequestIntent(storage: Pick<Storage, "getItem" | "removeItem">, draftKey: string, consumer: string): void {
  try {
    const retained = readRetainedIntent(storage, draftKey);
    if (!retained || routeConsumer(retained.route) !== consumer) return;
    storage.removeItem(`${draftKey}:continuation`);
    if (readRequestDraft(storage, draftKey) === retained.request) storage.removeItem(draftKey);
  } catch { /* Browser storage is optional. */ }
}

export function WorkspaceIntent(props: Props) { return <IntentSession key={props.draftKey} {...props} />; }
function IntentSession({ request, current = false, route = "start", draftKey, onSpent, children }: Props) {
  const [retained, setRetained] = useState<RetainedIntent>({ request: "", route: "", ready: false });
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let restored: RetainedIntent = { request: "", route: "", ready: true };
      try { restored = readRetainedIntent(window.sessionStorage, draftKey) ?? restored; } catch { /* Browser storage is optional. */ }
      setRetained(restored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftKey]);
  const spend = useCallback((consumer: string) => {
    try { spendRequestIntent(window.sessionStorage, draftKey, consumer); } catch { /* Browser storage is optional. */ }
    setRetained(value => routeConsumer(value.route) === consumer ? { request: "", route: "", ready: true } : value);
    onSpent?.(consumer);
  }, [draftKey, onSpent]);
  const value = useMemo<RequestIntent>(() => ({ ...(current || request ? { request, route, ready: true } : retained), spend }), [current, request, route, retained, spend]);
  return <IntentContext.Provider value={value}>{children}</IntentContext.Provider>;
}
